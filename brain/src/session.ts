// ─── SESSION MEMORY STORE (Redis-backed) ─────────────────────────────────────
// Per-session only. Each call's accumulated Partial<Triage> lives under its own
// Redis key `relay:session:{sessionId}` with a TTL, and is deleted the moment
// the call ends (clearSession). This satisfies §2 of the privacy guardrail:
// "no caller PII persists beyond the session boundary."
//
// Why Redis (and not the old in-process Map):
//   - Sub-millisecond reads on every utterance (the missingFields loop calls
//     getSession on each turn).
//   - Native per-key TTL auto-wipes PII even if a call is abandoned without a
//     clean hang-up — no cron job needed to honour the privacy guardrail.
//   - Horizontally scalable: multiple Brain instances can serve the same call
//     because session state is shared, not stuck in one process's heap.
//
// We use one key PER session (not a single shared hash) so each session's TTL
// is independent — abandoning one call must not reset the expiry of another.
// ─────────────────────────────────────────────────────────────────────────────

import Redis from 'ioredis';
import { Triage } from './types';

// Single shared client for the process. ioredis lazily connects and transparently
// reconnects, so we don't need to manage the connection lifecycle by hand.
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

// How long a session's partial triage survives without an explicit clear.
// One hour is generous for a live call while still bounding how long any PII
// could linger if a call is dropped mid-stream.
const SESSION_TTL_SECONDS = 60 * 60;

// Namespaced, per-session key. Keeping the prefix in one helper avoids typos
// drifting between get/update/clear.
function sessionKey(sessionId: string): string {
  return `relay:session:${sessionId}`;
}

/**
 * Returns the accumulated partial Triage for a session.
 * Returns an empty object if the session doesn't exist yet — callers
 * treat a missing session the same as a session with no data filled in.
 */
export async function getSession(sessionId: string): Promise<Partial<Triage>> {
  const raw = await redis.get(sessionKey(sessionId));
  return raw ? (JSON.parse(raw) as Partial<Triage>) : {};
}

/**
 * Deep-merges `update` into the existing session partial and saves it.
 *
 * Merge rules (designed for the incremental "fill in the slots" pattern):
 *  - Arrays (e.g. `needs`): concat + deduplicate, so each new utterance
 *    can add more needs without blowing away earlier ones.
 *  - Primitives / objects: the incoming value wins, UNLESS it is null and
 *    we already have a non-null value — we never downgrade a known slot back
 *    to unknown within the same session.
 *
 * Re-sets the TTL on every write so an active call (which writes on each
 * utterance) keeps its session alive, while an abandoned one expires.
 */
export async function updateSession(
  sessionId: string,
  update: Partial<Triage>
): Promise<void> {
  const existing = await getSession(sessionId);
  const merged = deepMerge(existing, update);
  await redis.set(
    sessionKey(sessionId),
    JSON.stringify(merged),
    'EX',
    SESSION_TTL_SECONDS
  );
}

/**
 * Deletes the session. Called at the end of every call so that no caller
 * data lingers. §2 privacy guardrail. (The TTL is a backstop; this is the
 * primary, immediate wipe.)
 */
export async function clearSession(sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
}

// ─── Merge helper ────────────────────────────────────────────────────────────

/**
 * Recursively merges `incoming` on top of `base` following the rules above.
 * Kept private to this module — nothing outside should need raw merging.
 */
function deepMerge(base: Partial<Triage>, incoming: Partial<Triage>): Partial<Triage> {
  // Start with a shallow copy so we don't mutate the original.
  const result: Partial<Triage> = { ...base };

  // Iterate only over keys that the incoming update actually provides.
  for (const _key of Object.keys(incoming) as Array<keyof Triage>) {
    const key = _key as keyof Triage;
    const incomingVal = incoming[key];
    const existingVal = base[key];

    if (key === 'needs') {
      // `needs` is the only array field in Triage. Concat and deduplicate
      // so multiple utterances accumulate rather than clobber each other.
      const existingNeeds = (existingVal as string[] | undefined) ?? [];
      const incomingNeeds = (incomingVal as string[] | undefined) ?? [];
      (result as Record<string, unknown>)[key] = Array.from(
        new Set([...existingNeeds, ...incomingNeeds])
      );
    } else if (key === 'nextQuestion') {
      // nextQuestion must always reflect the latest Claude response.
      // Unlike location or people, a stale question is actively harmful —
      // we never want to ask "where are you?" after the caller already answered.
      (result as Record<string, unknown>)[key] = incomingVal;
    } else if (incomingVal === null && existingVal != null) {
      // Never overwrite a known value with null — the new Claude call may
      // have simply not re-extracted a field that the caller already told us.
      // Keep the existing non-null value.
      (result as Record<string, unknown>)[key] = existingVal;
    } else if (
      typeof incomingVal === 'object' &&
      incomingVal !== null &&
      typeof existingVal === 'object' &&
      existingVal !== null &&
      !Array.isArray(incomingVal)
    ) {
      // For nested objects (currently only `location`), merge one level deep
      // so lat/lng can arrive in a later utterance and fill in a text-only
      // location from an earlier one.
      (result as Record<string, unknown>)[key] = {
        ...(existingVal as object),
        ...(incomingVal as object),
      };
    } else {
      // Plain primitives and booleans: incoming value wins.
      (result as Record<string, unknown>)[key] = incomingVal;
    }
  }

  return result;
}
