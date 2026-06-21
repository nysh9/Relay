// ─── RELAY Matchmaker — Express Server (port 3002) ───────────────────────────
// Person C. Consumes a Triage, produces a Dispatch via Redis vector search +
// deterministic ranking. The Next.js frontend's /api/dispatch proxy already
// points here (MATCHMAKER_API_URL, default http://localhost:3002).
//
//   [Brain] → Triage → POST /dispatch (here) → Dispatch → [Map]
//
// Redis is seeded once on boot (resources + capability embeddings + vector
// index). Each /dispatch does a KNN recall and a deterministic rank.
// ─────────────────────────────────────────────────────────────────────────────

import express, { Request, Response, NextFunction } from 'express';
import { seed, isVectorMode } from './redisStore';
import { buildDispatch } from './match';
import { TriageInput } from './contracts';

const app = express();
app.use(express.json());

// CORS — the Next.js frontend (port 3000) may call this directly in dev.
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

/** GET /health — liveness + which match mode is active. */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, mode: isVectorMode() ? 'vector' : 'keyword', timestamp: new Date().toISOString() });
});

/**
 * POST /dispatch
 * Body: a Triage object, either bare or wrapped as { triage }. Tolerant of both
 * the frontend contract shape and the Brain's types.ts shape (see adaptTriage).
 * Response: Dispatch.
 */
app.post('/dispatch', async (req: Request, res: Response) => {
  // Accept { triage: {...} } or a bare triage body.
  const body = req.body as { triage?: TriageInput } & TriageInput;
  const triage: TriageInput = body.triage ?? body;

  const sessionId = triage.sessionId ?? body.sessionId ?? 'unknown';

  if (!triage || (!triage.needs && !triage.location && !triage.locationLatLng)) {
    res.status(400).json({ error: 'a triage with needs and/or a location is required' });
    return;
  }

  try {
    const dispatch = await buildDispatch(sessionId, triage);
    res.json(dispatch);
  } catch (err) {
    console.error('[matchmaker] dispatch error:', err);
    res.status(500).json({ error: 'matchmaker failed', detail: String(err) });
  }
});

const PORT = process.env.MATCHMAKER_PORT ? parseInt(process.env.MATCHMAKER_PORT, 10) : 3002;

// Seed Redis BEFORE accepting traffic so the first /dispatch has an index ready.
seed()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[RELAY Matchmaker] listening on http://localhost:${PORT}`);
      console.log(`[RELAY Matchmaker] match mode: ${isVectorMode() ? 'Redis vector search' : 'keyword fallback'}`);
    });
  })
  .catch((err) => {
    console.error('[matchmaker] failed to seed Redis on boot:', err);
    process.exit(1);
  });

export default app;
