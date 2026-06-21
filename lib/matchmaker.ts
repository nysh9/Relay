import type { Resource, CallerLocation, Dispatch, ResourceMatch } from "../types";

// ─── Distance: Haversine formula ──────────────────────────────────────────────
// Great-circle distance between two lat/lng points, in km. Pure math, no deps.
function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── The Matchmaker (HERO) ────────────────────────────────────────────────────
// Pure function: (needs, callerLocation, resources) → Dispatch.
// Deterministic, no AI, no network — fully testable in isolation.
//
// GUARDRAIL (§2): NEVER invents a resource. If nothing in the dataset meets the
// needs AND has capacity, `matched` is null and dispatchText says so. We never
// fabricate a location, name, or capacity.
export function findMatch(
  needs: string[],
  callerLocation: CallerLocation,
  resources: Resource[]
): Dispatch {
  // 1. Keep only resources that meet at least one need AND have capacity.
  const candidates = resources.filter((r) => {
    const meetsANeed = needs.some((need) => r.has.includes(need));
    const hasCapacity = r.availableCapacity > 0;
    return meetsANeed && hasCapacity;
  });

  // 2. GUARDRAIL: nothing fits → say so, never fabricate.
  if (candidates.length === 0) {
    return {
      matched: null,
      alternatives: [],
      dispatchText:
        "No available resource in the dataset matches these needs. Escalating to a human operator.",
    };
  }

  // 3. Score by distance (dominant factor); capacity breaks near-ties.
  const scored = candidates
    .map((r) => ({ resource: r, distance: distanceKm(callerLocation, r) }))
    .sort((a, b) => {
      if (Math.abs(a.distance - b.distance) < 0.1) {
        return b.resource.availableCapacity - a.resource.availableCapacity;
      }
      return a.distance - b.distance;
    });

  // 4. Best match.
  const best = scored[0];
  const matched: ResourceMatch = {
    resourceId: best.resource.id,
    name: best.resource.name,
    type: best.resource.type,
    distanceKm: round1(best.distance),
    available: best.resource.availableCapacity > 0,
  };

  // 5. Next 2-3 alternatives.
  const alternatives = scored.slice(1, 4).map((s) => ({
    resourceId: s.resource.id,
    name: s.resource.name,
    distanceKm: round1(s.distance),
  }));

  // 6. Human-readable dispatch line.
  const dispatchText = `Needs: ${needs.join(", ")} → ${matched.name}, ${matched.distanceKm}km, ${best.resource.availableCapacity} slots available`;

  return { matched, alternatives, dispatchText };
}