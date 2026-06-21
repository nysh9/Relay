// ─── SESSION MEMORY STORE ────────────────────────────────────────────────────
// Per-session only. Data is NEVER written to disk or a shared store during
// a call — it lives only in this process's Map and is wiped the moment the
// call ends (clearSession). This satisfies §2 of the privacy guardrail:
// "no caller PII persists beyond the session boundary."
//
// TODO — swapping to Redis (ioredis) later:
//   1. Replace `store` Map with an ioredis client:
//        import Redis from 'ioredis';
//        const redis = new Redis(process.env.REDIS_URL);
//   2. getSession  → `const raw = await redis.hget('sessions', sessionId);`
//                    `return raw ? JSON.parse(raw) : {};`
//   3. updateSession → fetch, merge (same logic below), then:
//                    `await redis.hset('sessions', sessionId, JSON.stringify(merged));`
//                    `await redis.expire('sessions', SESSION_TTL_SECONDS);`
//   4. clearSession → `await redis.hdel('sessions', sessionId);`
//   All functions become async — callers in server.ts will need `await`.
// ─────────────────────────────────────────────────────────────────────────────

import { Triage } from './types';

// The in-memory store. One entry per active call, keyed by sessionId.
const store = new Map<string, Partial<Triage>>();

/**
 * Returns the accumulated partial Triage for a session.
 * Returns an empty object if the session doesn't exist yet — callers
 * treat a missing session the same as a session with no data filled in.
 */
export function getSession(sessionId: string): Partial<Triage> {
  return store.get(sessionId) ?? {};
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
 */
export function updateSession(sessionId: string, update: Partial<Triage>): void {
  const existing = store.get(sessionId) ?? {};
  const merged = deepMerge(existing, update);
  store.set(sessionId, merged);
}

/**
 * Deletes the session. Called at the end of every call so that no caller
 * data lingers in memory. §2 privacy guardrail.
 */
export function clearSession(sessionId: string): void {
  store.delete(sessionId);
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
