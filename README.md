# RELAY

**Built at Berkeley AI Hackathon 2026.**

RELAY is an operator-facing disaster-relief intake dashboard. A caller speaks
in their own language (demo: Hindi) → speech is transcribed live → Claude
extracts a structured triage (who, where, how many, what's needed, how urgent)
→ a deterministic matchmaker routes them to the nearest resource with
capacity → a dispatcher watches it all resolve on a map in real time.

```
LISTEN → UNDERSTAND → MATCH → SHOW
 (Ear)    (Brain)   (Matchmaker) (Map)
```

No AI invents a resource or a dispatch decision — matching is deterministic
TypeScript over real data; Claude only reads the transcript and fills in the
triage. See [`docs/DESIGN_BRIEF.md`](docs/DESIGN_BRIEF.md) for the full product
and design rationale.

## Architecture

RELAY is five independent services plus a shared Redis instance. Each can run
standalone; wired together they form the full pipeline.

| Service | Dir | Role | Port |
|---|---|---|---|
| **Ear** | [`server/`](server) | Mic capture (browser) → WebSocket → Deepgram streaming STT | `8080` |
| **Brain** | [`brain/`](brain) | Transcript → structured Triage JSON via Claude, session memory in Redis | `4001` |
| **Matchmaker** | [`matchmaker/`](matchmaker) | Triage → matched resource via Redis vector search + deterministic ranking | `3002` |
| **Classifier** *(stretch)* | [`classifier/`](classifier) | TF-IDF + LogisticRegression urgency check Brain consults for a second opinion | `8000` |
| **Dashboard** | [`src/`](src) (Next.js) | Operator UI + `/api/*` proxies to Brain/Matchmaker + Deepgram TTS | `3000` |
| **Live UI** | [`frontend/`](frontend) | Figma-designed dashboard, wired end-to-end to the real backend | Vite default |
| Redis Stack | `docker-compose.yml` | Brain session memory (TTL) + Matchmaker vector index | `6379` |

Two UIs exist because of how the team split up work: [`src/`](src) is the
original Next.js dashboard (also demoable standalone with mock data, no
backend needed), and [`frontend/`](frontend) is a Figma-designed rebuild wired
to the live pipeline — this is the one used for the demo. Both call the same
`/api/triage`, `/api/dispatch`, and `/api/speak` routes served by the Next.js
app in `src/`, so that app (or at least its API routes) needs to be running
either way.

## Quick start

**Demo mode (no backend, mock data):**

```bash
npm install
npm run dev
# → http://localhost:3000
```

**Full pipeline (live mic → Claude → dispatch):** see
[`docs/SETUP.md`](docs/SETUP.md) for env vars, Redis, and per-service startup
— or bring every service up together:

```bash
npm run dev:all   # web + brain + ear, concurrently
```

then in separate shells: `cd matchmaker && npm run dev`, `cd frontend && npm run dev`,
and optionally `cd classifier && python server.py`.

## Repo layout

```
relay/
├── src/                  Next.js dashboard (UI + /api/* proxy routes)
├── frontend/              Figma-designed live UI (Vite + React), wired to the real backend
├── server/                Ear — audio capture, WS server, Deepgram STT
├── brain/                 Brain — Claude triage, Redis session memory
├── matchmaker/             Matchmaker — Redis vector search + resource ranking
├── classifier/             Urgency classifier (Python/FastAPI, stretch goal)
├── data/                  Shared demo resource dataset
├── docker-compose.yml     Redis Stack (session memory + vector search)
├── docs/                  Setup guide + design brief
├── AGENTS.md / CLAUDE.md  Agent-facing project instructions
└── .claude/               Claude Code launch config
```

## Docs

- [`docs/SETUP.md`](docs/SETUP.md) — environment variables, Redis, running each
  service, wiring the live backend, demo rehearsal checklist.
- [`docs/DESIGN_BRIEF.md`](docs/DESIGN_BRIEF.md) — full visual design spec
  (color system, layout, component states, animations).
- Each service has its own README with the details specific to it:
  [`server/README.md`](server/README.md), [`classifier/README.md`](classifier/README.md),
  [`brain/HERO_CALL.md`](brain/HERO_CALL.md) (the scripted demo call).

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind · Mapbox GL JS (dashboard) /
Leaflet (live UI) · Express · Redis Stack (RediSearch vector index) ·
Claude (Anthropic SDK) · Deepgram (streaming STT + Aura TTS) · Python /
FastAPI + scikit-learn (classifier).
