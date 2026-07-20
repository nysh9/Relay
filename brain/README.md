# Brain

**Transcript → structured Triage JSON.** Port `4001`.

The Brain takes the live transcript from the Ear, sends it to Claude to extract a
structured triage (who, where, how many, what's needed, how urgent), and keeps
per-call session memory in Redis so a triage can be built up turn by turn. It
optionally consults the [Classifier](../classifier) for a second opinion on
urgency and takes the *more severe* of the two (over-escalation bias).

- **Input:** `POST /triage` with `{ "sessionId": "...", "transcript": "..." }`
- **Output:** a `Triage` object (contract in [`src/types`](src/types))
- **Session memory:** stored at `relay:session:{sessionId}` in Redis with a 1-hour
  TTL, cleared via `POST /session/clear`.

Session memory shares one Redis Stack instance with the Matchmaker.

## Run

```bash
npm install
npm run dev        # :4001
```

Requires `ANTHROPIC_API_KEY` and `REDIS_URL` (see the root [`.env.example`](../.env.example)).
Optionally set `CLASSIFIER_URL` to enable the urgency second opinion.

See [`HERO_CALL.md`](HERO_CALL.md) for the scripted demo call, and the root
[`docs/SETUP.md`](../docs/SETUP.md) for full environment setup.
