# RELAY — Claude Design Brief

**What this file is:** A complete visual design specification for Claude Design.
Produce high-fidelity mockups for every screen, state, and component listed below.
The developer (Person D) will port these directly into Next.js + Tailwind, so every
color, spacing, and state decision here becomes code. Be precise.

---

## 1. Product context (read before designing anything)

RELAY is an **operator-facing** disaster-relief intake dashboard — not a consumer app.
The end user is a **relief-org dispatcher** watching calls get triaged and routed in
real time. The caller in crisis never sees this UI; they're on the phone.

The product runs during a hurricane / flood event. The dispatcher's environment is
stressful: loud emergency-operations center, multiple screens, high stakes.
Design must communicate **calm authority** — dense but readable, never playful.

The pipeline the UI visualises, left to right:
```
LISTEN → UNDERSTAND → MATCH → SHOW
 (Ear)    (Brain)   (Matchmaker) (Map)
```
A Hindi-speaking caller speaks → transcript streams in → chaos resolves into
structured triage → the map lights up with a matched shelter or resource.

The **map payoff is the hero moment** of the 3-minute demo. Everything in the left
panel exists to set that moment up.

---

## 2. Visual direction

**Tone:** Mission-critical infrastructure. Think NOAA radar, not SaaS dashboard.
Dark, dense, precise. Colour carries meaning — never decoration.

**Reference feelings:**
- Flight-operations display (ATC / airline ops)
- Emergency-dispatch software (CAD systems)
- High-contrast terminal UI

**Anti-references (do NOT do these):**
- Consumer health apps (soft gradients, rounded cards, pastels)
- SaaS sales dashboards (empty states with illustrations)
- Dark "hacker aesthetic" (neon green on black, cyber vibes)

**One-line design principle:** every pixel earns its place by communicating
pipeline state or resource data. No decoration that doesn't carry meaning.

---

## 3. Color system

### Base palette

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0A0E1A` | Page background — near-black with a blue undertone |
| `panel` | `#111827` | Sidebar panels, cards |
| `panel-raised` | `#1A2235` | Elevated card within a panel |
| `border` | `#1F2937` | All panel/card borders |
| `border-subtle` | `#111827` | Dividers within a panel |
| `text-primary` | `#F3F4F6` | Primary content |
| `text-secondary` | `#9CA3AF` | Labels, metadata |
| `text-dim` | `#4B5563` | Placeholder, disabled |

### Semantic / priority colours

These carry hard meaning — use them for nothing else.

| Token | Hex | Meaning |
|---|---|---|
| `priority-p1` | `#EF4444` | P1 — Critical / life-threatening |
| `priority-p2` | `#F59E0B` | P2 — Urgent, stable |
| `priority-p3` | `#3B82F6` | P3 — Non-urgent |
| `priority-none` | `#6B7280` | Not yet triaged |
| `escalation-911` | `#EF4444` | Emergency services escalation |
| `escalation-human` | `#8B5CF6` | Human operator escalation |
| `accent` | `#3B82F6` | Interactive controls, active states |
| `success` | `#10B981` | Dispatched / confirmed |
| `warning` | `#F59E0B` | Reprompt / low confidence |

### Colour usage rules

- Priority colour appears in: priority chip, map pin, routing line, left border
  accent on the active triage card. Nowhere else.
- Never use `priority-p1` red for anything that isn't actually P1 or 911.
- The escalation banners use their colour at high saturation — they must be
  impossible to miss even in peripheral vision.

---

## 4. Typography

Font stack: **Inter** (system fallback: -apple-system, sans-serif).
No display fonts. No serif. Mono for data values only.

| Role | Size | Weight | Colour |
|---|---|---|---|
| Wordmark "RELAY" | 15px | 700 | white + accent on "LAY" |
| Section label | 10px | 600 | `text-secondary`, uppercase, letter-spacing 0.1em |
| Body / transcript | 13px | 400 | `text-primary` |
| Data value | 13px | 500 | `text-primary` |
| Metadata / sub-label | 11px | 400 | `text-secondary` |
| Chip / badge | 10px | 700 | varies by semantic colour |
| Mono data (distance, confidence) | 11px | 400 | `text-secondary`, `font-mono` |
| Dispatch summary | 12px | 400 | `text-primary`, `leading-relaxed` |

---

## 5. Layout — the single screen

RELAY is **one screen, no navigation**. Everything visible at once.

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER — 48px tall, full width                                     │
├─────────────────────────┬───────────────────────────────────────────┤
│                         │                                           │
│   LEFT SIDEBAR          │   MAP AREA                                │
│   400px fixed           │   flex-1 (fills remaining width)         │
│   overflow-y: scroll    │   overflow: hidden                        │
│                         │                                           │
│   ┌─ Escalation ──────┐ │   ┌─ Mapbox GL ─────────────────────┐   │
│   │ (only if active)  │ │   │                                  │   │
│   └───────────────────┘ │   │   Houston map                    │   │
│   ┌─ Transcript ──────┐ │   │   • Caller pin (white)           │   │
│   │ live Hindi lines  │ │   │   • Resource pins (priority clr) │   │
│   └───────────────────┘ │   │   • Animated routing line        │   │
│   ┌─ Triage ──────────┐ │   │                                  │   │
│   │ slots + P chip    │ │   └──────────────────────────────────┘   │
│   └───────────────────┘ │                                           │
│   ┌─ Dispatch ────────┐ │   Prototype badge — bottom-left of map   │
│   │ matched resource  │ │                                           │
│   └───────────────────┘ │                                           │
│   ┌─ Controls ────────┐ │                                           │
│   │ [Start / End call]│ │                                           │
│   └───────────────────┘ │                                           │
└─────────────────────────┴───────────────────────────────────────────┘
```

**Sidebar behaviour:**
- Sections stack top-to-bottom in pipeline order (Transcript → Triage → Dispatch).
- Each section slides in when its data first arrives (150ms ease-out, 8px Y offset).
- The sidebar scrolls if content overflows; the map never scrolls.
- Escalation banner, when present, pins to the TOP of the sidebar above Transcript.

**Map behaviour:**
- Fills the right area completely — no padding, no card border.
- Map controls (zoom only, no rotation) bottom-right.
- Prototype badge bottom-left, semi-transparent, 9px.

---

## 6. Header

Height: 48px. Full width. Background: `panel`. Border-bottom: `border`.

Left side:
- **RELAY** wordmark: "RE" in `text-primary`, "LAY" in `accent` (#3B82F6). 15px bold.
- Separator dot `·` in `text-dim`.
- "Disaster Response" in `text-dim`, 10px, uppercase, mono.

Right side (left to right):
- **Demo badge** (amber, only when `DEMO_MODE=true`):
  pill shape, 9px text, amber-900 bg, amber-400 text, amber-800 border.
  Label: "DEMO MODE"
- **Session status** text: 11px mono uppercase. Colour maps to state:
  - `IDLE` → `text-dim`
  - `LISTENING` → green (#10B981)
  - `PROCESSING` → blue (#3B82F6), with a subtle spinning icon
  - `TRIAGED` → amber (#F59E0B)
  - `DISPATCHED` → green (#10B981)
  - `ESCALATED` → red (#EF4444)
- **WS status dot + label** (hidden in demo mode):
  1.5px dot + 10px mono label. Green=LIVE, yellow pulse=CONNECTING, grey=OFFLINE.

---

## 7. Transcript panel

Always the first section in the sidebar. Shows from session start.

**Header row** (32px):
- Live indicator dot (6px): green + slow-pulse when listening, grey when idle.
- "LIVE TRANSCRIPT" label — 10px, uppercase, letter-spacing.
- "HI" language tag — right-aligned, 10px mono, `text-dim`.

**Transcript area** (max-height ~180px, scrollable):
- Final lines: 13px, `text-primary`, `leading-relaxed`. Each new line fades in.
- Interim line (current, not yet final): 13px, `text-secondary`, italic.
  Ends with a blinking cursor block (1.5px × 12px, `text-secondary`, 1s pulse).
- Empty state / idle: "Waiting for call…" in `text-dim`, italic.
- Listening but no text yet: "Listening…" in `text-dim`, italic.

**Reprompt sub-banner** (appears above transcript lines when triggered):
- Background: amber-900/40, border: amber-700/50, text: amber-300.
- Prefix icon: ⚠
- Text: the reprompt message (e.g. "I didn't catch that, can you repeat?")
- 12px, slides in from top.

**State: Interim line appearing**
Show the cursor blinking at the end of the current interim text.
The interim line is visually distinct (italic, dimmer) from confirmed final lines.

---

## 8. Triage card

Appears (slides in, 200ms) when the Brain returns the first Triage object.
Disappears back to nothing if the session ends and no new call starts.

**Header row** (32px):
- "TRIAGE" label — 10px uppercase.
- **Priority chip** — appears as soon as priority is set.
- "✓ Ready to route" — right-aligned, 10px, green (#10B981), mono.
  Only shown when `readyToRoute: true`.

**Priority chip** (the most visually prominent element in this panel):
```
P1  →  bg: red-900/60,   text: red-300,   border: red-700/50
P2  →  bg: amber-900/60, text: amber-300, border: amber-700/50
P3  →  bg: blue-900/60,  text: blue-300,  border: blue-700/50
```
Shape: 4px radius, 2px border, 10px text, bold, uppercase.
Left-border accent: 2px solid bar matching priority colour on the card's left edge.

**Slot rows** (the extracted facts):

Each slot: label (10px, `text-dim`, 64px wide) + value (13px, `text-primary`).

| Slot | Label | Missing state |
|---|---|---|
| Location | Location | italic "missing" in amber-600 |
| People | People | italic "missing" in amber-600 |
| Nature | Nature | italic "—" in `text-dim` |
| Needs | Needs | italic "missing" in amber-600 |

"Missing" fields (in `missingFields` array) are highlighted amber — they're
what the Brain still needs and what the operator should prompt for.

**Next question sub-card** (only shown when `nextQuestion` is non-null):
- Background: blue-950/50, border: blue-800/40, left-border: 2px blue-600.
- Prefix label "Ask:" in blue-500, bold, 11px.
- Question text in blue-300, 12px. This is the Hindi follow-up question.
- Slides in as a new element when `nextQuestion` changes.

**State: Partial triage (missing fields)**
Show the card with some slots filled, the missing ones in amber, and the
"Ask:" card with the follow-up question visible. This is the hero agent-behavior
moment — design it to be clearly readable from across a table.

**State: Full triage, ready to route**
All slots filled, "✓ Ready to route" visible, "Ask:" card gone.
The priority chip should be the visual anchor.

---

## 9. Dispatch panel

Appears (slides in) when the Matchmaker returns a Dispatch object.
Only appears when `readyToRoute: true` was set.

**Header row** (32px):
- Green dot (6px, solid, no pulse — this is a confirmed state).
- "DISPATCH" label — 10px uppercase.

**Dispatch summary text:**
- 12px, `text-secondary`, `leading-relaxed`.
- Left-border: 2px solid `success` (#10B981).
- Padding-left: 12px.
- Example: "Family of 4, no water → George R. Brown Convention Center, 2.1 km, 87 beds available"

**Matched resource card** (primary):
- Background: green-950/30. Border: green-700/50.
- Resource name: 12px, bold, green-300.
- Sub-line: type + address, 10px, `text-secondary`.
- Distance: right-aligned, 11px mono, `text-secondary`.
- **Capacity bar:**
  - Label row: "Capacity" left, "X / Y available" right, 10px `text-dim`.
  - Bar: 4px tall, rounded, `border`-colour bg.
  - Fill: green if >40% available, amber if 15–40%, red if <15%.
- **Capability tags:** small pills, 9px, uppercase, bg `border`, text `text-secondary`.
  e.g. `water` `beds` `meals` `medical`

**Other candidates** (if any — collapsed by default, shown as a small list):
- "Other options" label: 10px, `text-dim`, uppercase.
- Each: smaller version of the resource card, bg `panel`, border `border`.
  No capacity bar — just name, distance, and one line of capability tags.

---

## 10. Escalation banner

This is not a card — it is a **takeover**. Operators must not miss it.

Pins to the very top of the sidebar. Pushes everything else down.
Persists until the operator clicks Acknowledge.

### 10a. 911 escalation

Background: `red-950/80`. Left-border: 4px solid `#EF4444`.
Full sidebar width.

Layout:
```
● [pulsing red dot]  🚨 EMERGENCY — ROUTE TO 911      [4px left border red]
─────────────────────────────────────────────────────
Active emergency detected outside mass-care scope.
Do NOT attempt to route through RELAY — contact
emergency services immediately.
─────────────────────────────────────────────────────
[ Acknowledged — 911 Contacted ]    [small button, red border]
─────────────────────────────────────────────────────
Prototype · Mock dataset · Real escalation requires
integration with live dispatch systems              [9px, dim, italic]
```

The pulsing red dot: 16px, `#EF4444`, 2s slow pulse.
The acknowledgment button: small, 12px, red-200 text, red-500 border, hover: red-800 bg.

### 10b. Human operator escalation

Same structure, purple instead of red.
Background: `purple-950/80`. Left-border: 4px solid `#8B5CF6`.
Pulsing dot: purple-400.
Label: "👤 TRANSFER TO HUMAN OPERATOR"
Body: "Audio confidence below threshold after multiple attempts. A human operator is needed to continue this call."
Button: "Acknowledged — Transferring"

**Design rule:** both escalation banners must be legible in a thumbnail at 200px width.
They are seen under stress. High contrast, no subtlety.

---

## 11. Call controls (bottom of sidebar)

Height: ~72px. Background: `panel`. Border-top: `border`.

### State: Demo mode
Single button full-width:
- "▶ Run Demo Script" — primary blue button (`accent`), 14px semibold, white text.
- Sub-label below: "Animates the hero call end-to-end · safe for rehearsal" — 10px, `text-dim`, centered.

### State: Idle / call ended
- "Start Call" — full-width, green-700 bg, white text, 14px semibold.

### State: Call active (listening / processing / triaged)
- "End Call" — full-width, red-800 bg, white text, 14px semibold.

No icon clutter. Just the text + state colour.

---

## 12. Map design

### Base style
Dark map. Suggested direction: muted dark-navy base, de-saturated streets,
no labels except major road names and neighbourhood labels.
Water (bayous, reservoirs) should be slightly lighter than land — visible but
not bright. This is the colour territory you are unlocking for the custom style.

Houston centre coordinates: `-95.3698, 29.7604`.
Zoom range: 9–16. Starting zoom: 11.

### Caller pin
- 14px circle, white fill (`#FFFFFF`), 3px border in `#9CA3AF`.
- Box-shadow: `0 0 12px rgba(255,255,255,0.4)` — a soft white glow.
- Drop-in animation: scale 0 → 1 over 500ms with a spring overshoot
  (`cubic-bezier(0.34, 1.56, 0.64, 1)`).
- Tooltip on hover: "Caller location" — dark card, 11px, no arrow.

### Resource pins (unmatched)
- 12px circle. Fill: `#374151`. Border: `#4B5563` 2px.
- Dim — present but not calling attention.

### Resource pin (matched / primary)
- 20px circle. Fill + border: **priority colour** (P1 red / P2 amber / P3 blue).
- **Pulse ring animation:** ring expands outward from the pin and fades,
  repeating every 2s. Think ripple/sonar. CSS keyframe.
- Drop-in: same spring animation as caller pin, 400ms.
- Tooltip: resource name + available capacity + capability list.

### Routing line (caller → matched resource)
- Dashed line: dash 4px, gap 4px.
- Colour: **priority colour** (same as matched pin).
- Width: 2.5px.
- Opacity: 0.85.
- **Draw animation:** the line animates from caller to resource over ~800ms
  (dash-offset animation: the line "draws" itself). This is the hero visual moment.

### Map after full dispatch
The camera animates (`fitBounds`) to frame both the caller pin and the matched
resource pin, with ~80px padding. Duration: 1200ms smooth.
This is the moment the demo is built toward — make the transition feel significant.

### Prototype badge
Bottom-left of the map area. Always visible, never hidden.
Background: `bg/80` semi-transparent. Border: `border`. 4px radius.
Text: "Prototype · Mock dataset · Houston, TX" — 9px, `text-dim`, italic.
This satisfies the §2 demo-honesty requirement — must be in every mockup.

---

## 13. Screens to design

Produce one high-fidelity mockup for each of the following states.
Label them clearly. They map directly to the 3-minute demo flow.

### Screen 1 — Idle / waiting
- Header: LIVE status green dot, "IDLE" status, WS "Offline" (or Demo badge).
- Sidebar: Transcript panel only (empty state: "Waiting for call…"), call controls showing "Start Call".
- Map: Houston overview at zoom 11, no pins.

### Screen 2 — Listening / interim transcript
- Header: "LISTENING" status.
- Sidebar: Transcript panel with 1–2 final lines + 1 interim line mid-stream
  with cursor blink. No triage card yet.
- Map: no pins yet (caller location not yet extracted from transcript).

### Screen 3 — Partial triage (missing fields + follow-up question)
**This is the "agent, not a transcriber" proof moment — design it to impress.**
- Header: "PROCESSING" status.
- Sidebar:
  - Transcript: 2 final lines (the vague opener), no interim.
  - Triage card: P2 chip, Location=missing (amber), People=missing (amber),
    Nature filled, Needs filled. "Ask:" card showing Hindi follow-up question.
  - No Dispatch yet. No escalation.
- Map: still no pins (readyToRoute: false).

### Screen 4 — Full triage, routing in progress
- Header: "TRIAGED" status.
- Sidebar:
  - Transcript: 3 lines (added the answer to the follow-up).
  - Triage card: P2 chip, all slots filled, "✓ Ready to route" visible. No "Ask:" card.
  - Dispatch panel: not yet shown (matchmaker is running — show a subtle
    "Routing…" micro-state: a spinner or dash animation in the dispatch slot area).
- Map: caller pin dropped in. Resource pins visible across Houston (unmatched, dim).

### Screen 5 — Dispatched (hero moment)
**The payoff. The map lights up. Design this one last and make it the best.**
- Header: "DISPATCHED" status, green.
- Sidebar:
  - Transcript: 3 final lines.
  - Triage card: P2, all filled, "✓ Ready to route".
  - Dispatch panel: fully populated — dispatch summary text, primary resource card
    (George R. Brown Convention Center or similar), capacity bar, capability tags.
- Map:
  - Caller pin (white).
  - Matched resource pin (P2 amber, pulsing ring).
  - Other resource pins (dim grey).
  - Routing line drawn from caller to resource (dashed amber).
  - Camera fitted to show both pins.
  - Prototype badge visible.

### Screen 6 — 911 escalation
- Header: "ESCALATED" status, red.
- Sidebar:
  - 911 escalation banner pinned at top (red, pulsing, full detail as in §10a).
  - Transcript: 2 lines showing the emergency utterance.
  - Triage card: partial (nature filled with emergency type), no dispatch.
- Map: caller pin only. No routing. No resource pins highlighted.

### Screen 7 — Human escalation (low-confidence)
- Header: "ESCALATED" status, purple.
- Sidebar:
  - Human escalation banner pinned at top (purple, as in §10b).
  - Transcript: 1–2 lines, one showing garbled/low-confidence text.
  - Reprompt banner visible in transcript area (amber, "I didn't catch that…").
- Map: Houston overview, no pins.

---

## 14. Micro-animations to specify

These are the motion moments that elevate the demo. Define timing, easing,
and the before/after state for each.

| Animation | Duration | Easing | Notes |
|---|---|---|---|
| Section slide-in (Transcript, Triage, Dispatch) | 250ms | ease-out | Y: 8px → 0, opacity: 0 → 1 |
| Triage card: slot fill | 150ms per slot | ease | Stagger each slot 50ms apart |
| Priority chip appear | 200ms | spring overshoot | Scale: 0.6 → 1 |
| Caller pin drop | 500ms | spring (0.34, 1.56, 0.64, 1) | Scale: 0 → 1 |
| Resource pin drop | 400ms | spring (0.34, 1.56, 0.64, 1) | Stagger: 80ms between pins |
| Routing line draw | 800ms | ease-in-out | Dash-offset: full → 0 |
| Match pin pulse ring | 2s loop | ease-out | Ring expands 0 → 20px, opacity 1 → 0 |
| Camera fit-bounds | 1200ms | Mapbox default | After dispatch confirms |
| Escalation banner | 300ms | ease-out | Slides in from top, pushes content down |
| Reprompt banner | 200ms | ease-out | Fade + slight Y slide |

---

## 15. Component states summary

For each component, show these states in the mockups:

**Transcript panel:**
- Empty / idle
- Listening (interim line + cursor)
- Final lines only
- With reprompt banner

**Triage card:**
- Not present (before first triage)
- Partial (missing fields + nextQuestion)
- Complete (readyToRoute: true)
- P1 variant (red chip)
- P2 variant (amber chip)
- P3 variant (blue chip)

**Dispatch panel:**
- Not present (before dispatch)
- Loading / "Routing…" state
- Fully populated with a matched resource
- No-match state (text: "No matching resource found in dataset")

**Escalation banner:**
- 911 variant
- Human operator variant
- Not present (null / normal flow)

**Priority chip:** P1, P2, P3 (show all three isolated, at 2× size for reference)

**Resource pin:** unmatched (grey), P1 matched (red pulse), P2 matched (amber pulse), P3 matched (blue pulse)

---

## 16. Things to explicitly NOT design

- Login / auth screen
- Mobile layout (desktop only)
- 3D map
- TTS / audio playback controls
- Multi-call / queue view (one call at a time)
- Settings or configuration panel
- Toast notifications (escalation banner is the notification surface)
- Loading skeletons (sections simply don't render until data arrives)
- Any illustration, icon set, or decorative element not driven by data

---

## 17. Assets to deliver

1. **Component library** — all components in all states, on `bg` (#0A0E1A) background.
2. **Screen 1–7** — full 1440px-wide mockups of each screen state listed in §13.
3. **Priority chip reference** — P1/P2/P3 at large size for developer reference.
4. **Map pin reference** — caller pin + matched (P1/P2/P3) + unmatched, at 4× size.
5. **Routing line reference** — dashed line sample in P1/P2/P3 colours.
6. **Escalation banners** — both 911 and human variants at full sidebar width.
7. **Colour tokens** — a swatch sheet of every token in §3 with hex values.

Export all screens as PNG at 2×. Export the component library as a Figma or
Claude Design frame that the developer can reference while coding.

---

## 18. Custom map style guidance

The map style is delivered separately (user to upload a reference image).
When the custom style is applied, ensure:
- The dark base (#0A0E1A-family tones) complements the sidebar without competing.
- Water features (Buffalo Bayou, bayous, Barker Reservoir) are distinguishable
  from land without being bright.
- Street labels are legible at zoom 12 but don't crowd the pin markers.
- The map has no satellite/aerial imagery — vector only.
- Houston neighbourhood labels (Midtown, Montrose, The Heights, Third Ward) are
  visible to give geographic context during the demo.

Once the style image is provided, update the Mapbox style URL in
`src/components/RelayMap.tsx` at the marked comment.

---

*End of design brief. Produce all seven screens and the component library.
Return as high-fidelity mockups at 1440 × 900px (the demo laptop resolution).*
