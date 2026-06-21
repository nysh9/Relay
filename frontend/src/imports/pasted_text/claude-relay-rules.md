@AGENTS.md
# CLAUDE.md — RELAY (working name)

Context and operating rules for Claude Code on this project.
Read this fully before writing code.
Optimize for a flawless 3-minute live demo, not a shippable product.
UI/visual design is done in Claude Design (see the separate design brief).
This file is the engine: pipeline, data contracts, routing logic, guardrails.

---

## LOCKED DECISIONS (read first — these gate everything downstream)

- **City:** Houston, TX. One city, all map/geocoding bounds restricted to it.
- **Disaster:** ONE scenario — hurricane / flooding (Harvey-style mass-care event). Keep every sample call and the dataset in this lane.
- **Hero-call language:** The demo caller speaks a non-English language (e.g. Hindi for the live demo run). UI + structured output language: English. The system is multilingual — any language Deepgram supports is valid input. Never hardcode a single language anywhere in the codebase.
- **Priority:** CORE. Claude emits priority as the default so the demo never depends on the model. The trained classifier (§9) is a STRETCH upgrade that replaces Claude's priority only if core + routing + map are done.
- **TTS (voice-back confirmation):** SKIPPED. The map + dispatch readout is the confirmation. One less live failure point.
- **Translation architecture:** Claude understands the caller's transcript DIRECTLY in whatever language Deepgram returns. Deepgram transcribes in the caller's language → Claude reads it and emits English structured Triage. No separate translation step. The original-language transcript may still be shown in the UI for judges, but the understanding path has no dedicated translator (fewer failure points; reinforces the "not Google Translate" pitch).

---

## 1. What we're building

RELAY is a multilingual disaster-relief intake agent. Someone in crisis speaks — in their own language — and RELAY listens in real time, understands the emergency, triages it, and routes the caller to the closest real resource that can help, shown on a live map. It is a pipeline over one live call, not a pile of features.

Four stages, each feeding the next:

```
LISTEN → UNDERSTAND → MATCH → SHOW
 (Ear)    (Brain)   (Matchmaker★) (Map)
```

Track: Ddoski's World (social impact).
Sponsors targeted: Deepgram (voice) + Anthropic (reasoning) + Redis (Matchmaker backbone) + Arize and/or Sentry (reliability, near-free adds — see §13).

### Who it's for (establish this FIRST in the pitch)

The customer is the disaster-relief organization / emergency-management agency (Red Cross, FEMA mass-care, local relief NGOs, the 211 disaster lines) running mass-care intake during a disaster. The caller in crisis is the INPUT, not the buyer — they never choose RELAY any more than a 911 caller chooses the dispatch software behind the call-taker. They call the number they already know (211, or 911 overflow), and RELAY is the AI that picks up the mass-care calls when there aren't enough humans to.

This is the settled framing — do not drift back toward "a victim chooses RELAY over Google search." That comparison is weak (a phone that can call can also search) and it's not our claim. Our claim is intake infrastructure for the org: triage and route thousands of simultaneous multilingual calls in parallel, which no human bank and no search bar can do.

**One-line framing:** "RELAY is the AI intake-and-routing layer for disaster-relief lines — for the moment call volume and language barriers are too high for humans to triage alone."

### The need is documented (cite this — it's the 'why now')

- **Disaster lines saturate.** During Hurricane Helene, local 911 in Western NC was so overwhelmed the public was told to call only for life-threatening emergencies. 211 disaster lines field thousands of calls per event (NJ 211: 4,000 calls after Hurricane Wilma; Michigan 211: 13,555 calls in one flood event, 23,000 emergency support calls coordinating 12,000 water deliveries).
- **The language gap is real and slow.** 211 lines already fall back to 3rd-party interpreters for 100+ languages — and for less-common languages, the caller is told to CALL BACK at an appointed time. That callback queue, during a flood, is the wedge: RELAY triages in-language, instantly, with no interpreter bottleneck.
- **Why Houston:** one of the most linguistically diverse cities in the US — the multilingual need is obvious within a single city, on reliable infrastructure, with concrete data.

### Why not just 211 / an interpreter line (the kill-shot question — have this cold)

1. **Throughput + language.** A human line handles one call at a time and reaches for an interpreter (minutes per call, or a callback for rarer languages). In a mass disaster with thousands of simultaneous multilingual calls, that model saturates. RELAY triages in parallel, in the caller's language, instantly.
2. **Triage-and-route, not translate.** RELAY doesn't just convert words — it understands "infant, no water, someone on oxygen," assigns priority, and matches to the RIGHT mass-care resource, then hands to a human. A translation layer on an IVR does none of that.
3. **A front door when the formal system is underwater.** 211/911 may be jammed; RELAY is surge capacity the relief org stands up to catch the mass-care overflow — and it escalates true emergencies (active medical/fire/violence) back to 911 rather than handling them (see §2). Escalation is a shown feature, not a failure.

**Pitch version:** "In a disaster, relief lines saturate in minutes — thousands of calls, dozens of languages, and for rarer languages you get a callback queue while the water rises. RELAY is the AI that answers the mass-care overflow, triages it in the caller's language, routes it to the right shelter or supplies, and hands true emergencies back to 911."

**Roadmap framing:** the same engine extends globally — to underserved/immigrant populations within any country, and to the high-exposure, low-infrastructure regions that carry most of the world's disaster burden (≈89% of the 1.47B newly flood-exposed people are in low-to-middle-income countries) and often have NO 211/Language-Line equivalent at all.

**Demo consistency rule:** keep sample calls and the dataset in the relief lane (shelter, water, medical capacity), never the 911 lane. The differentiation only holds if the demo looks like mass-care routing, with the 911 escalation shown as a boundary RELAY respects.

### The hero

The Matchmaker (routing) is the star, not the translation. Real engineering hours go into the routing engine and the triage protocol — not the voice plumbing, not the prompt.

**Architecture principle (burn this in):** The LLM narrates and structures; deterministic code does the defensible work. Claude understands the call and emits structured data. The routing engine (plain TypeScript) decides the match. The priority comes from a small trained classifier (stretch), not vibes.

---

## 2. NON-NEGOTIABLE GUARDRAILS (crisis domain)

These are an ethical requirement and a trust signal. Violating any is a bug.

- **Not a replacement for emergency services.** RELAY is an intake-and-routing aid; real responders and a human stay in the loop. State this in the UI and the pitch.
- **Always hand off to a human.** Every routed match is a hand-off, never a final authority. RELAY routes to mass-care resources and flags for a human operator — it does NOT dispatch responders (that is the 911 lane we avoid).
- **Escalation paths (build these as real behaviors):** if the situation is a true emergency beyond mass-care (active medical, fire, violence), RELAY offers/initiates a connection to 911. If the caller is inaudible, incoherent, or the case is ambiguous after retries, RELAY escalates to a human operator. Escalation is a feature to show, not a failure.
- **Never invent a resource.** Only route to entries that exist in the dataset. If nothing fits the need, say so — never fabricate help, a location, or a capacity.
- **Claude never decides the match or the priority.** Claude extracts structured facts only. The routing engine matches; the classifier (or a deterministic rule) rates urgency.
- **Bias toward over-escalation.** When urgency is ambiguous, round up. A false alarm is safer than a missed emergency. Comment this as a deliberate design choice.
- **Calm, clear, dignified language.** The caller is in crisis. No alarmist or condescending phrasing.
- **Privacy.** Treat call audio/transcript as sensitive. Do not persist it beyond the session. No accounts, no stored call history. Redis session memory is per-session and wiped at session end.
- **Demo honesty.** Frame as a prototype, not a deployed system. The Houston resource dataset is a realistic mock unless real data is swapped in — say so.

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | UI components designed in Claude Design, ported in |
| Audio capture | Browser getUserMedia + Web Audio API | Mic in browser is the demo input |
| Transport | WebSocket (ws) | Persistent connection; voice needs low latency, not HTTP |
| Speech-to-text | Deepgram streaming STT | Multilingual — language auto-detected or passed as parameter; interim + final results |
| Reasoning | Claude (Anthropic API) | "The Brain" — reads transcript in any language, emits English structured triage JSON only |
| Routing engine | Plain TypeScript | "The Matchmaker" — the moat, deterministic |
| Resource data | Redis (Plan A) / JSON file (Plan B mock) | Mock first so you're never blocked; load into Redis + embed for vector search |
| Map | Mapbox GL JS | Mapbox for polish; geocoding restricted to Houston bounds |
| Backend | Node WebSocket server | Run locally for the demo to remove network variance |
| Urgency model (stretch) | scikit-learn via tiny FastAPI service | See §9 |
| Observability (add) | Arize (Brain/classifier) + Sentry (WS/Deepgram path) | See §13 — near-free reliability adds |

**Demo input decision:** browser mic, with pre-recorded clips as backup. A real phone number (Twilio) is a great "what's next" but adds a telephony layer that risks the demo — skip for the build, mention as roadmap.

**Hosting:** run the WS server + Next app locally on the demo laptop. Removes a live failure point (Vercel doesn't hold persistent WebSockets well).

---

## 4. The data contracts (define these FIRST)

Locking these shapes lets stages be built in parallel and lets Claude Design mock the UI against real structure.

```typescript
// EAR → client/brain
type Transcript = {
  text: string;
  language: string;   // BCP-47 language code detected by Deepgram, e.g. "hi", "es", "zh", "ar"
  isFinal: boolean;
  confidence: number;
};

// BRAIN (Claude, structured output only — reads transcript in any language, emits English)
type Triage = {
  summary: string;
  people: number | null;        // null = not yet provided
  injuries: string | null;
  location: { text: string; lat?: number; lng?: number } | null;
  needs: string[];              // e.g. ["water","shelter","medical"]
  priority: "P1" | "P2" | "P3"; // from Claude in core; replaced by classifier in stretch
  missingFields: string[];      // required slots still empty, e.g. ["location"]
  nextQuestion: string | null;  // follow-up question in the caller's language
  readyToRoute: boolean;        // true only when required slots are filled
  escalate: "none" | "human" | "911";
};

// MATCHMAKER (deterministic TS)
type Dispatch = {
  matched: { resourceId: string; name: string; type: string; distanceKm: number; available: boolean };
  alternatives: Array<{ resourceId: string; name: string; distanceKm: number }>;
  dispatchText: string; // "Family of 4, no water → Lincoln Shelter, 1.2km, 8 beds"
};

// RESOURCE (dataset entry)
type Resource = {
  id: string;
  name: string;
  type: string;       // "shelter" | "medical" | "water" ...
  lat: number;
  lng: number;
  capacity: number;
  has: string[];      // ["water","beds","medical"]
};

// SESSION MEMORY (Redis, per-session, wiped at session end — see §13)
type Session = {
  sessionId: string;
  detectedLanguage: string;           // BCP-47 code, set on first final transcript
  partialTriage: Partial<Triage>;     // accumulates across utterances for the missingFields loop
};
```

---

## 5. The four stages

### 1 — The Ear (listen)
Mic stream → WS → Deepgram streaming STT. Configure Deepgram for automatic language detection OR pass the target language code as a parameter — never hardcode a single language. Emit interim results (live "typing" effect) and final results (trigger processing). Handle turn-taking via Deepgram `endpointing` / `utterance_end` events — don't roll your own.

### 2 — The Brain (understand)
On a final utterance, send the transcript (in whatever language Deepgram detected) to Claude; get back a Triage object in English. Claude must return only structured JSON, must not invent a location/resource, and must not make the final match call. Claude emits priority in core (classifier replaces it in stretch). The `nextQuestion` field should be in the caller's detected language so the operator/TTS can relay it back.

### 3 — The Matchmaker (match — HERO)
Pure function `(needs, location, resources) → Dispatch`. In Plan A, Redis vector search proposes candidate resources (semantic match on needs vs. capabilities); deterministic TS then ranks candidates by distance + available capacity and produces `dispatchText`. Fully testable with plain inputs, no AI deciding the match. This is your defensible substance.

### 4 — The Map (show)
Caller pin + resource pins + a routing line to the matched resource, color-coded by priority. Plus the live transcript panel, triage card (P1/P2/P3 chip), and dispatch readout. Designed in Claude Design, wired to the contracts above. 2D, not 3D.

### 5.5 — Conversation handling & edge cases

- **Missing info → RELAY asks.** The triage protocol has required slots: location, number of people, nature of emergency, needs. After each utterance the Brain checks `missingFields`; if a critical one is empty, it sets `nextQuestion` (in the caller's language) and `readyToRoute: false`. The matchmaker only runs when `readyToRoute: true`. Demo move: make one sample call start vague so judges watch RELAY ask the follow-up.
- **Inaudible / low-confidence → re-prompt, don't guess.** Use Deepgram's confidence score. If below `CONFIDENCE_THRESHOLD` (~0.6, tune on demo mic), RELAY says "I didn't catch that, can you repeat?" After N=2 failed attempts → `escalate: "human"`. Never guess at garbled audio.
- **Location comes from the CALL, never device GPS.** Geocode the location the caller states to a point within the Houston bounding box (Mapbox geocoding restricted to that bbox).
- **Map is 2D, not 3D — deliberate.** Spend the effort on motion instead — the pin drop, the routing line drawing, the match pulsing.
- **True emergency beyond mass-care → offer 911.** If the Brain detects an active medical/fire/violence emergency, set `escalate: "911"` and surface a "connect to emergency services" action.

---

## 6. Build sequence (the actual order)

1. **Scaffold + data.** Next.js (TS + Tailwind). Add `resources.json` (Plan B mock first). Hardcode one caller location for the demo (a Houston address).
2. **Prove the Brain in isolation.** Hardcoded transcript string (any language) → backend route → Claude → English Triage JSON. Get it correct before any audio.
3. **Build the Matchmaker.** The pure routing function. Test with plain inputs.
4. **Wire WebSocket + Deepgram.** Mic → WS → Deepgram (multilingual, auto-detect) → transcript on screen. Riskiest plumbing; do it after Brain + Matchmaker work.
5. **Chain it.** Final transcript → Brain → Matchmaker → emit Dispatch to client.
6. **Map + UI.** Port the Claude Design components; make the match light up on the map. Build the human-operator hand-off surface.
7. **Harden the hero call.** One scenario, rehearsed, flawless. Tune Deepgram language detection + turn-taking + confidence threshold. Test on the actual demo mic.
8. **Backup + polish.** Record the clean clip path + a full backup video. Rehearse 5×.

*(Sponsor adds — Redis in steps 1/3, Arize + Sentry once the chain in step 5 works. Never before the core path runs.)*

---

## 7. The hard parts (where hours secretly go)

- **WebSocket audio streaming** — buffering, the sample-rate/format Deepgram expects, detecting utterance end. The fiddliest piece. Build steps 2–3 first so it isn't blocking.
- **Turn-taking / endpointing** — lean on Deepgram's `utterance_end` / `endpointing` events rather than custom logic.
- **Keeping the Brain grounded** — strict structured-JSON output; Claude never invents a location or resource; the Matchmaker (not Claude) decides the match.
- **Multilingual handling** — confirm Deepgram language detection config; confirm Claude reads any supported transcript language reliably and emits clean English Triage. Test with at least two different input languages early in step 2.
- **Local-first demo** — run everything on the demo laptop to remove network variance on the most failure-prone path.

---

## 8. Scope — depth, not width

**In:** one scenario (Houston hurricane/flood), one location, one flawless hero call in a non-English language; the full pipeline; a real-or-realistic resource dataset; a clean map payoff.

**Cut without mercy:** computer vision, a 3D map, accounts/login/history, national coverage, real phone calls (roadmap only), mobile polish, TTS voice-back, anything off the demo path.

**Rule:** if it won't appear in the 3-minute demo, it doesn't exist this weekend. Add depth to the pipeline, never width into new domains.

---

## 9. STRETCH — urgency classifier (build ONLY if core pipeline + routing + map are done)

A small trained model that assigns P1/P2/P3 from triage text, replacing the LLM's vibes-based priority with a measured one.

- **Data:** ~150–300 synthetic labeled call transcripts (any language, translated to English summaries for training). Have Claude generate them across clear P1/P2/P3; spot-correct labels.
- **Model:** TF-IDF + LogisticRegression (scikit-learn). Trains in seconds.
- **Eval:** hold out 20% → accuracy + confusion matrix. "It never confuses a P1 for a P3."
- **Wire-in:** tiny FastAPI `/classify` (text → `{priority, confidence}`) that the Node backend calls.
- **Budget:** ~1.5 hrs. Strictly a stretch — never blocks the core demo.

---

## 10. The 3-minute demo

- **0:00** Hook: "When a disaster hits a diverse city like Houston, relief lines saturate in minutes — thousands of calls, dozens of languages. For the rarer ones, you get a callback queue while the water rises."
- **0:25** The call: an overflow call comes in — someone speaks in a non-English language; transcript streams in live alongside the English-output triage. (Establish: this is a mass-care intake line, not 911.)
- **1:00** It understands: chaos becomes structure — people, injuries, location, needs — with a priority. The "triage, not translate" beat.
- **1:40** The match (hero): map lights up — caller, resources, the routed line. "Routed to Lincoln Shelter — 1.2km, has water, 8 beds. Flagged for operator hand-off."
- **2:20** Why it matters + next: the org triages thousands in parallel, in-language, human-in-the-loop; escalates true emergencies to 911. Roadmap: same engine scales to underserved populations and high-exposure, low-infrastructure regions worldwide.

**Differentiation line:** "A human line translates one call at a time, then puts rarer languages in a callback queue. RELAY understands the crisis, triages it against a real protocol, and routes it to the right resource — in parallel, instantly. Translation is just what gets us in the door."

---

## 11. The one risk to respect

Live voice in a loud hall is brutal — latency, mishears, noise. Mitigate: wired headset or quiet corner for the live run, a narrow rehearsed happy-path, and a pre-recorded clean demo video you cut to without hesitation if the live run wobbles. Teams that win with voice don't have the best agent — they have the demo that can't fail.

---

## 12. Coding conventions

- TypeScript strict. Small, readable components. Model/data logic on the server, never the client.
- Env vars for all keys (Deepgram, Anthropic, Mapbox, Redis, Arize, Sentry); never commit secrets; never expose keys client-side.
- **Never hardcode a language code** anywhere in the pipeline. Language is always a runtime value from Deepgram's response, passed through the system as `transcript.language`.
- No browser storage APIs; no persistence of call data (privacy). Redis session memory is per-session and wiped at session end.
- Comment the guardrail-critical code (grounding, over-escalation, "never invent a resource") so a judge reading the repo sees the care.

---

## 13. SPONSOR INTEGRATIONS (added tracks)

### Redis — Matchmaker backbone
- Move `resources.json` into Redis on server start (HSET per resource, or RedisJSON if available).
- Vector search for the matching step: embed each resource's type + `has` capabilities, embed the caller's needs, semantic nearest-match to propose candidates.
- Deterministic TS still makes the final call: vector search recalls candidates, the TS engine ranks by distance + capacity.
- Redis session memory for the multi-turn triage loop: store the partial Triage and `detectedLanguage` keyed by `sessionId`. Per-session, wiped at session end.
- Judge talking point: "Redis vector search for agent memory + context retrieval."

### Arize — observability on the Brain + classifier (~30 min; add once the chain in step 5 works)
- Log each input transcript (with language code) + output Triage JSON to Arize as a trace.
- If the §9 classifier exists, log its P1/P2/P3 + confidence alongside Claude's.
- Deliverable: find one miscalibration, tune prompt/threshold, show before/after.

### Sentry — error monitoring on the riskiest plumbing (~30 min; add once the chain works)
- Wrap the WebSocket server + Deepgram streaming path in Sentry error capture.
- Capture latency / dropped-connection events on the audio stream, plus Claude/API failures.

**Effort order:** Redis is real and serves the hero. Arize and Sentry are each near-free instrumentation — add after the core path runs, never before.

---

## Open questions (RESOLVED — kept for reference)

- **Scenario + location:** RESOLVED — Houston, TX; hurricane/flood; one scenario.
- **Resource data:** realistic Houston mock first (Plan B), loaded into Redis + embedded for vector search (Plan A).
- **Languages:** RESOLVED — multilingual input (any language Deepgram supports), English UI/output. The live demo hero call uses a non-English language to prove the point.
- **Voice-back (TTS):** RESOLVED — skipped. Map + dispatch readout is the confirmation.
- **Translation architecture:** RESOLVED — Claude reads the transcript directly in the caller's language and emits English Triage; no separate translation step.

## Still to specify before parallel work starts

- Lock the data contracts in §4 as the single source of truth (incl. `Session.detectedLanguage` for Redis).
- Build the geocoding step: spoken location string → lat/lng within the Houston bbox.
- Build the three escalation behaviors as real code (low-confidence → human at N=2; true emergency → 911; ambiguous → human). Set `CONFIDENCE_THRESHOLD` and tune on the demo mic.
- Define the Redis vector schema (what's embedded, index config, candidate hand-off to the ranker).
- Build the human-operator hand-off UI surface (the escalate target — flag for operator, not dispatch).
- Write the realistic Houston `resources.json` (15–25 entries, real lat/lng inside Houston bounds).
