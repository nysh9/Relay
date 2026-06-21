> This lives alongside the Next.js app in this repo (`app/`) as a **separate
> Node process** — per CLAUDE.md §3, the WS server and the Next app run
> side-by-side locally for the demo, not as one bundled app. Don't move this
> into `app/api/` — Deepgram's streaming WS connection doesn't fit Next's
> request/response (or edge-route) model cleanly.

# RELAY — Person A: The Ear

Audio capture + WebSocket + Deepgram streaming STT (Hindi), built against the
locked contracts in CLAUDE.md §4. Runnable on its own to prove the audio
path works before the chain-it session (§6 step 5).

## What's in here

```
src/
  types.ts          Transcript + Session, copied verbatim from §4. Plus
                     Person A's own WS wire-protocol types (provisional —
                     not part of §4, for the browser<->Ear connection only).
  server.ts          Node WS server. Serves public/ statically (so the
                     AudioWorklet can load) and bridges browser audio <-> Deepgram.
  deepgramClient.ts  Opens one Deepgram streaming connection per session.
                     Hindi, interim+final results, utterance_end turn-taking.
  sessionManager.ts  The retry/escalation state machine (§5.5/§13):
                     confidence < CONFIDENCE_THRESHOLD -> reprompt;
                     N=2 failures -> escalate:"human"; stop retrying.
  brainStub.ts       Fake "Brain" — echoes the transcript to the console.
                     Stands in for Person B until their real module exists.
  backupAudio.ts     Streams a pre-recorded Hindi clip through the SAME
                     Deepgram connection a live mic would use (§11 insurance).
public/
  index.html         Bare test harness (NOT the real demo UI — Person D owns that).
  client.js           getUserMedia + AudioWorklet mic capture, WS client.
  pcm-worklet.js      Downsamples mic audio to 16-bit PCM @ 16kHz mono —
                     the exact format deepgramClient.ts expects.
audio/
  README.md          Where to drop the backup clip.
```

## Setup

```bash
npm install
cp .env.example .env
# edit .env and set DEEPGRAM_API_KEY=<your key>
npm run dev
```

Open `http://localhost:8080`, click **Start (mic)**, speak (Hindi for the
real demo). You should see interim transcript text update live, then a final
line commit. Click **Use backup clip** to test the insurance path instead
(needs a `.pcm` file dropped in `audio/` — see `audio/README.md`).

## Contract note

`Transcript` and `Session` in `types.ts` are copied **exactly** from
CLAUDE.md §4 — no changes. Everything else in `types.ts`
(`EarToClientMessage`, `ClientToEarMessage`, `SessionState`) is Person A's
own wire format for the browser↔Ear WebSocket and is **not** part of the
team contract — Person D should treat it as provisional until the chain-it
session, since it's local plumbing between this component's own client and
server, not a cross-team handoff shape.

## What's stubbed vs. real

- **Real**: mic capture, WS transport, Deepgram streaming (Hindi,
  interim/final, utterance-end turn-taking), confidence-threshold reprompt
  logic, N=2 escalation to `"human"`, backup-clip insurance path.
- **Stubbed**: the Brain. `brainStub.ts` just logs what it would send to
  Claude. Swap it out once Person B's real module exists — same call site in
  `server.ts` (`fakeBrainProcess(transcript)`), same input shape
  (`Transcript`).
- **Deliberately not built yet**: Sentry error capture on this WS/Deepgram
  path. Per §13, sponsor integrations are added only *after* the chain-it
  session (§6 step 5) proves the core pipeline works — there's a `TODO`
  marking the exact spot in `server.ts`.

## Known gaps / things to verify on the real demo mic

- `CONFIDENCE_THRESHOLD` (default 0.6) is a starting point per §5.5 — tune
  it against the actual room mic before the demo, not a quiet room.
- The PCM downsampling in `pcm-worklet.js` is a simple linear-interpolation
  resampler — fine for STT, but if Deepgram's Hindi accuracy seems off, rule
  this out first by testing with a 16kHz-native mic input.
- `npm run backup-clip` runs the backup-clip path standalone against a real
  Deepgram connection (no WS server, no browser) — useful for isolating
  "is this a Deepgram/audio-format problem" from "is this a WS/UI problem."
