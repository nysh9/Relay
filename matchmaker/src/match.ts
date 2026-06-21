// ─── The Matchmaker (deterministic) ──────────────────────────────────────────
// THE HERO. Redis vector search RECALLS semantically-relevant candidates; this
// plain TypeScript DECIDES the match by ranking on need-overlap, distance, and
// available capacity. No AI makes the routing call (§1 architecture principle).
//
// Guardrail (§2): we only ever return resources that exist in the dataset. If
// nothing fits, matchedResource is null — we never invent help.
// ─────────────────────────────────────────────────────────────────────────────

import { Dispatch, Resource, TriageInput } from './contracts';
import { knnSearch, tagSearch, scanAllResources, isVectorMode } from './redisStore';
import { geocodeHouston, distanceKm } from './geocode';

const CANDIDATE_K = 8;

// Map caller-spoken needs onto resource capability tokens, so "shelter" matches
// a resource that `has: ["beds"]`, "hungry" matches "food"/"meals", etc.
const NEED_SYNONYMS: Record<string, string[]> = {
  shelter: ['beds', 'blankets'],
  housing: ['beds'],
  sleep: ['beds'],
  hungry: ['food', 'meals'],
  food: ['food', 'meals'],
  meal: ['meals'],
  hospital: ['medical'],
  sick: ['medical', 'first_aid'],
  injured: ['medical', 'first_aid'],
  injury: ['medical', 'first_aid'],
  oxygen: ['oxygen'],
  formula: ['baby_formula'],
  baby: ['baby_formula', 'diapers'],
  infant: ['baby_formula', 'diapers'],
  diaper: ['diapers'],
  evacuate: ['transport'],
  evacuation: ['transport'],
  ride: ['transport'],
  transport: ['transport'],
  wheelchair: ['wheelchair_access'],
  pet: ['pet_friendly'],
  dialysis: ['dialysis'],
  translator: ['translation'],
  language: ['translation'],
};

function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/** Expand a caller need into the set of capability tokens that would satisfy it. */
function expandNeed(need: string): string[] {
  const n = normalizeToken(need);
  return [n, ...(NEED_SYNONYMS[n] ?? [])];
}

/** How many of the caller's needs this resource can fulfil. */
function needOverlap(resource: Resource, needs: string[]): number {
  const caps = new Set(resource.has.map(normalizeToken));
  // type itself can satisfy a same-named need, e.g. need "shelter" ~ type "shelter"
  caps.add(normalizeToken(resource.type));
  let count = 0;
  for (const need of needs) {
    if (expandNeed(need).some((tok) => caps.has(tok))) count++;
  }
  return count;
}

// ─── Triage input adapter (tolerant of both contract shapes) ──────────────────

interface AdaptedTriage {
  needs: string[];
  callerLatLng: [number, number];
  numberOfPeople: number | null;
  locationText: string | null;
}

export function adaptTriage(input: TriageInput): AdaptedTriage {
  const needs = Array.isArray(input.needs) ? input.needs.filter(Boolean) : [];

  // numberOfPeople (frontend) OR people (brain types.ts)
  const numberOfPeople =
    input.numberOfPeople ?? input.people ?? null;

  // Caller coordinates, in priority order:
  //   1. explicit locationLatLng (frontend contract)
  //   2. nested location.{lat,lng} (brain types.ts)
  //   3. geocode the spoken location text (string OR location.text)
  let callerLatLng: [number, number] | null = null;
  let locationText: string | null = null;

  if (Array.isArray(input.locationLatLng)) {
    callerLatLng = input.locationLatLng;
  }
  if (typeof input.location === 'string') {
    locationText = input.location;
  } else if (input.location && typeof input.location === 'object') {
    locationText = input.location.text ?? null;
    if (!callerLatLng && typeof input.location.lat === 'number' && typeof input.location.lng === 'number') {
      callerLatLng = [input.location.lat, input.location.lng];
    }
  }

  if (!callerLatLng) {
    callerLatLng = geocodeHouston(locationText);
  }

  return { needs, callerLatLng, numberOfPeople, locationText };
}

// ─── Candidate recall (vector → keyword → scan fallbacks) ─────────────────────

async function recallCandidates(needs: string[]): Promise<Resource[]> {
  const needsText = needs.length ? needs.join(' ') : 'shelter water help';

  // Preferred path: Redis vector search.
  if (isVectorMode()) {
    try {
      const hits = await knnSearch(needsText, CANDIDATE_K);
      if (hits.length) return hits;
    } catch (err) {
      console.error('[matchmaker] KNN search failed, falling back to keyword:', err);
    }
  }

  // Fallback 1: Redis TAG keyword match on capabilities.
  try {
    const hits = await tagSearch(needs, CANDIDATE_K);
    if (hits.length) return hits;
  } catch (err) {
    console.error('[matchmaker] TAG search failed, falling back to full scan:', err);
  }

  // Fallback 2: raw dataset scan — guarantees a non-empty candidate set.
  return scanAllResources();
}

// ─── Ranking + dispatch assembly ──────────────────────────────────────────────

function rank(
  candidates: Resource[],
  needs: string[],
  caller: [number, number]
): Array<Resource & { _overlap: number; _distance: number }> {
  return candidates
    .map((r) => ({
      ...r,
      _overlap: needOverlap(r, needs),
      _distance: distanceKm(caller, [r.lat, r.lng]),
    }))
    .sort((a, b) => {
      // 1. Open capacity first — never lead with a full site.
      const aOpen = a.availableCapacity > 0 ? 1 : 0;
      const bOpen = b.availableCapacity > 0 ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      // 2. More of the caller's needs met.
      if (a._overlap !== b._overlap) return b._overlap - a._overlap;
      // 3. Closer is better.
      if (a._distance !== b._distance) return a._distance - b._distance;
      // 4. More headroom.
      return b.availableCapacity - a.availableCapacity;
    });
}

function unitFor(type: Resource['type']): string {
  switch (type) {
    case 'shelter':
      return 'beds';
    case 'medical':
      return 'open slots';
    case 'evacuation':
      return 'seats';
    case 'distribution':
    default:
      return 'kits';
  }
}

function buildDispatchText(
  people: number | null,
  needs: string[],
  matched: Resource | null,
  dist: number | null
): string {
  if (!matched) {
    return needs.length
      ? `No available resource currently matches: ${needs.join(', ')}. Flagged for operator.`
      : 'No available resource matched. Flagged for operator.';
  }
  const who = people && people > 0 ? `Party of ${people}` : 'Caller';
  const needStr = needs.length ? `needs ${needs.join(', ')}` : 'mass-care';
  const distStr = dist != null ? `${dist.toFixed(1)} km` : 'distance n/a';
  return `${who}, ${needStr} → ${matched.name}, ${distStr}, ${matched.availableCapacity} ${unitFor(matched.type)} open. Flagged for operator hand-off.`;
}

/**
 * Produce a Dispatch for a triage. The single entry point the server calls.
 */
export async function buildDispatch(
  sessionId: string,
  input: TriageInput
): Promise<Dispatch> {
  const { needs, callerLatLng, numberOfPeople } = adaptTriage(input);

  const candidates = await recallCandidates(needs);
  const ranked = rank(candidates, needs, callerLatLng);

  // Best match = top ranked with any open capacity. If every candidate is full,
  // we still surface the best-ranked (operator can decide) rather than invent one.
  const best = ranked.find((r) => r.availableCapacity > 0) ?? ranked[0] ?? null;

  const matchedResource: Resource | null = best ? stripInternal(best) : null;
  const dist = best ? best._distance : null;

  // Up to 4 alternative candidates for the UI "other options" panel.
  const candidateList: Resource[] = ranked
    .filter((r) => r.id !== best?.id)
    .slice(0, 4)
    .map(stripInternal);

  return {
    sessionId,
    matchedResource,
    dispatchText: buildDispatchText(numberOfPeople, needs, matchedResource, dist),
    distanceKm: dist != null ? Number(dist.toFixed(2)) : null,
    callerLatLng,
    candidates: candidateList,
    timestamp: Date.now(),
  };
}

/** Drop the internal ranking fields before returning a clean Resource. */
function stripInternal(r: Resource & { _overlap?: number; _distance?: number }): Resource {
  const { _overlap, _distance, ...clean } = r as Resource & {
    _overlap?: number;
    _distance?: number;
  };
  void _overlap;
  void _distance;
  return clean;
}
