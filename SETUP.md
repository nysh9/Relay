# RELAY — Person D Setup Guide

## Quick start (demo mode, no backend needed)

```bash
cd relay
npm install
npm run dev
# → open http://localhost:3000
```

`NEXT_PUBLIC_DEMO_MODE=true` is set by default in `.env.local`.
The app loads with mock triage + dispatch data and a Houston map.
Press **▶ Run Demo Script** in the sidebar to animate the full pipeline live.

---

## Environment variables (.env.local)

| Variable | Default | What it does |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | `your_token_here` | Mapbox public token — get one at account.mapbox.com |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8080` | Person A's Node WS server |
| `BRAIN_API_URL` | `http://localhost:3001` | Person B's triage API |
| `MATCHMAKER_API_URL` | `http://localhost:3002` | Person C's dispatch API |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | `false` to connect to the real backend |

Backend services (export in the shell that runs each one — see `.env.example`):

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude key for the Brain (`brain/`) |
| `REDIS_URL` | `redis://localhost:6379` | Shared Redis Stack — Brain session memory + Matchmaker vector index |

---

## Redis (session memory + vector search)

The Brain (session memory, per-call, TTL-wiped) and the Matchmaker (resource
vector search) share one **Redis Stack** instance (Redis + Query Engine). Start it
with Docker from the repo root:

```bash
docker compose up -d redis     # start Redis Stack on :6379
docker exec relay-redis redis-cli ping   # → PONG
docker compose down            # stop
```

- **Brain** stores each call's partial triage at `relay:session:{sessionId}` with a
  1-hour TTL, deleted on `POST /session/clear` (privacy guardrail §2).
- **Matchmaker** seeds `matchmaker/resources.json` into Redis on boot, embeds each
  resource's capabilities (local all-MiniLM, no API key), and serves `POST /dispatch`
  via KNN vector recall + deterministic distance/capacity ranking. It degrades to
  keyword (TAG) matching if the embedding model is unavailable, so the demo never
  hard-fails.

```bash
cd matchmaker && npm install && npm run dev   # :3002 (downloads model on first run)
```

---

## Swapping in the custom map style

1. Upload your map style to Mapbox Studio and copy the style URL  
   (format: `mapbox://styles/<username>/<style-id>`)
2. Open `src/components/RelayMap.tsx`
3. Find the comment `// ── Swap this URL when you have the custom map style image ──`
4. Replace `"mapbox://styles/mapbox/dark-v11"` with your style URL

---

## Wiring the live backend (chain-it session, §6 step 5)

### Step 1 — set env vars
```bash
# .env.local
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_WS_URL=ws://localhost:8080   # Person A
BRAIN_API_URL=http://localhost:3001      # Person B
MATCHMAKER_API_URL=http://localhost:3002 # Person C
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ...      # your real token
```

### Step 2 — verify Person A's WS message contract

Person A's server must emit JSON frames matching `WsMessage` in `src/types/contracts.ts`.  
Key event types the UI listens for:

```
session_start        → { type, sessionId }
interim_transcript   → { type, transcript: Transcript }
final_transcript     → { type, transcript: Transcript }
triage_update        → { type, triage: Triage }
dispatch             → { type, dispatch: Dispatch }
escalation           → { type, escalate: "911"|"human", escalationReason? }
reprompt             → { type, repromptMessage: string }
```

### Step 3 — verify Person B's triage endpoint

`POST /triage` at `BRAIN_API_URL` must accept:
```json
{ "sessionId": "...", "transcript": "Hindi text here" }
```
and return a `Triage` object.

The Next.js app proxies this at `/api/triage` to avoid CORS.

### Step 4 — verify Person C's dispatch endpoint

`POST /dispatch` at `MATCHMAKER_API_URL` must accept a `Triage` object  
and return a `Dispatch` object.

Proxied at `/api/dispatch`.

---

## File map

```
relay/
├── src/
│   ├── types/
│   │   └── contracts.ts          ← §4 locked data contracts (do not rename fields)
│   ├── lib/
│   │   └── mockData.ts           ← hardcoded demo data; swap for real once backend live
│   ├── hooks/
│   │   ├── useWebSocket.ts       ← WS connection + reconnect (Person A interface)
│   │   ├── useMic.ts             ← getUserMedia + PCM16 chunking
│   │   └── useRelay.ts           ← central state machine (session, triage, dispatch)
│   ├── components/
│   │   ├── TranscriptPanel.tsx   ← live Hindi transcript (interim + final)
│   │   ├── TriageCard.tsx        ← P1/P2/P3 chip + missing fields + next question
│   │   ├── DispatchPanel.tsx     ← matched resource + capacity bar + candidates
│   │   ├── EscalationBanner.tsx  ← 911 / human-operator guardrail surface
│   │   └── RelayMap.tsx          ← Mapbox GL JS map (dynamic import, SSR: false)
│   └── app/
│       ├── layout.tsx
│       ├── page.tsx              ← main layout, calls useRelay, renders everything
│       ├── globals.css
│       └── api/
│           ├── triage/route.ts   ← proxy → Person B
│           └── dispatch/route.ts ← proxy → Person C
```

---

## Demo rehearsal checklist (§10 / §11)

- [ ] `npm run dev` — app opens, map loads, demo button works
- [ ] Run Demo Script 5× end-to-end with no clicks other than the button
- [ ] Confirm P1 → red pin / P2 → amber / P3 → blue
- [ ] Confirm escalation banner shows for both "911" and "human" paths
- [ ] Record backup video of a clean run (OBS or QuickTime)
- [ ] Test on the actual demo machine with the demo mic
- [ ] Swap `NEXT_PUBLIC_DEMO_MODE=false` + run against live backend
- [ ] If live mic wobbles → switch to `DEMO_MODE=true` + pre-recorded clip

---

## TypeScript check

```bash
npm run type-check
```

No errors expected on a clean install.
