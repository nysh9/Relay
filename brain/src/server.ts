// ─── RELAY Brain — Express Server ────────────────────────────────────────────
// This is the HTTP face of the Brain pipeline stage.
//
// Where it sits in the pipeline:
//   [Ear / Next.js frontend]
//       → POST /triage      (transcript + sessionId)
//       ← { triage, sessionId }
//       → POST /session/clear  (when the call ends)
//
// What it does on each /triage request:
//   1. Loads any accumulated Partial<Triage> from session memory (same call,
//      earlier utterances may have already filled some slots).
//   2. Passes the new transcript + the existing partial to runBrain(), which
//      calls Claude and returns a fresh Triage.
//   3. Merges the fresh Triage back into session memory (so future utterances
//      build on it rather than starting from scratch).
//   4. Returns the merged Triage to the caller.
//
// brain.ts will be written next — it owns the actual Anthropic SDK call.
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config'; // load brain/.env (ANTHROPIC_API_KEY) before anything reads it
import express, { Request, Response, NextFunction } from 'express';
import { getSession, updateSession, clearSession } from './session';
import { Triage, TriageRequest, TriageResponse } from './types';

// brain.ts will be written next — runBrain() is the only thing this server
// delegates to Claude. The function signature is:
//   runBrain(transcript: string, existing: Partial<Triage>): Promise<Triage>
import { runBrain } from './brain';

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

// Parse JSON bodies. Must come before any route that reads req.body.
app.use(express.json());

// CORS — the Next.js frontend runs on port 3000 in dev. Without these headers
// the browser will block the response before JS can read it.
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Browsers send a preflight OPTIONS request before POST — respond 200 so
  // they proceed with the actual request.
  if (_req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
});

// Request logger — prints method, path, sessionId (if present), and wall time.
// Intentionally lightweight: no body content is logged (PII risk — §2).
app.use((req: Request, _res: Response, next: NextFunction) => {
  const sessionId =
    (req.body as { sessionId?: string } | undefined)?.sessionId ?? // POST bodies
    (req.query['sessionId'] as string | undefined) ??              // query params (health checks, etc.)
    '—';

  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.path}  sessionId=${sessionId}`
  );
  next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Quick liveness check. The Ear and any orchestrators can poll this to
 * confirm the Brain server is up before placing or forwarding a call.
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

/**
 * POST /triage
 * Core route. Accepts a transcript utterance and returns the latest merged
 * Triage. Can be called multiple times per session as the caller answers
 * follow-up questions — the missingFields loop.
 *
 * Body: { transcript: string, sessionId: string }
 * Response: { triage: Triage, sessionId: string }
 */
app.post('/triage', async (req: Request, res: Response) => {
  const { transcript, sessionId } = req.body as TriageRequest;

  // Basic validation — both fields are required; missing either means the
  // Ear sent a malformed request.
  if (!transcript || !sessionId) {
    res.status(400).json({ error: 'transcript and sessionId are required' });
    return;
  }

  // 1. Load whatever we already know about this caller from earlier utterances.
  const existingPartial = getSession(sessionId);

  // 2. Ask Claude to read the new transcript in context of what we know already.
  //    runBrain returns a *complete* Triage (all required keys present, nulls
  //    for slots it couldn't fill yet) — session.ts merge rules handle the rest.
  let freshTriage: Triage;
  try {
    freshTriage = await runBrain(transcript, existingPartial);
  } catch (err) {
    // Surface Claude errors clearly so the Ear can decide whether to retry
    // or tell the operator something went wrong.
    console.error('runBrain error:', err);
    res.status(502).json({ error: 'Brain Claude call failed', detail: String(err) });
    return;
  }

  // 3. Merge the fresh Triage into session memory. This means a second
  //    utterance can fill in `location` that was missing from the first.
  updateSession(sessionId, freshTriage);

  // 4. Read back the merged state — this is what we return, not just
  //    freshTriage, because merging may have preserved fields from earlier
  //    utterances that Claude didn't re-extract this time.
  const mergedTriage = getSession(sessionId) as Triage; // safe: freshTriage guarantees all keys

  const response: TriageResponse = { triage: mergedTriage, sessionId, transcript };
  res.json(response);
});

/**
 * POST /session/clear
 * Called by the Ear at the end of every call to wipe session memory.
 * §2 privacy guardrail: no caller data should outlive its session.
 *
 * Body: { sessionId: string }
 * Response: { ok: true }
 */
app.post('/session/clear', (req: Request, res: Response) => {
  const { sessionId } = req.body as { sessionId: string };

  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }

  clearSession(sessionId);
  res.json({ ok: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────

// Use PORT from the environment so deployment platforms (Railway, Fly, etc.)
// can inject their own port without code changes. Default 4001 — deliberately
// OUTSIDE Next.js's 3000→3001→3002 auto-increment range so a bumped `next dev`
// can never steal the Brain's port (that collision caused /api/triage 404s).
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4001;

app.listen(PORT, () => {
  console.log(`[RELAY Brain] listening on http://localhost:${PORT}`);
  console.log(`[RELAY Brain] CORS open to http://localhost:3000`);
});

export default app; // exported so tests can import the app without starting the listener
