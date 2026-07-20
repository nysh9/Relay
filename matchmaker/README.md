# Matchmaker

**Triage → matched resource.** Port `3002`.

The Matchmaker is the deterministic core of RELAY: given a triage, it routes the
caller to the nearest resource with capacity. No model decides the dispatch —
matching is Redis vector recall over the resource dataset followed by
deterministic distance/capacity ranking.

- **Input:** `POST /dispatch` with a `Triage` object
- **Output:** a `Dispatch` object (matched resource + ranked alternatives, or
  `null` when nothing fits — never a fabricated match)

On boot it seeds [`resources.json`](resources.json) into Redis, embeds each
resource's capabilities locally (all-MiniLM, no API key), and serves matches via
KNN vector recall. If the embedding model is unavailable it degrades to keyword
(TAG) matching, so the demo never hard-fails.

## Run

```bash
npm install
npm run dev        # :3002 — downloads the embedding model on first run
```

Requires `REDIS_URL` (shared Redis Stack instance — see the root
[`.env.example`](../.env.example)). Start Redis with `docker compose up -d redis`
from the repo root.

> **Note:** the demo resource dataset currently exists in two places —
> [`resources.json`](resources.json) here and [`../data/resources.json`](../data)
> (used by the Next.js `/api/dispatch` route). These have drifted apart; pick one
> as the source of truth before a production build. See the root
> [`docs/SETUP.md`](../docs/SETUP.md).
