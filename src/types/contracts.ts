/**
 * RELAY — §4 Data Contracts
 *
 * These are the locked interfaces all four team members code against.
 * Do NOT change field names without a team-wide sync — every stage
 * depends on these shapes.
 *
 * Ear (A) → emits WsMessage
 * Brain (B) → consumes Transcript, produces Triage
 * Matchmaker (C) → consumes Triage, produces Dispatch
 * Map/UI (D) → consumes all of the above
 */

// ── Priority ────────────────────────────────────────────────────────────────

export type Priority = "P1" | "P2" | "P3" | null;
// P1 = critical (life-threatening, immediate dispatch)
// P2 = urgent   (needs help within the hour)
// P3 = stable   (can wait / informational)
// null = not yet determined

// ── Escalation ──────────────────────────────────────────────────────────────

export type EscalateTarget = "911" | "human" | null;
// "911"   → active emergency outside mass-care lane (fire, violence, medical crisis)
//           BIAS TOWARD OVER-ESCALATION: false alarm < missed emergency (§2)
// "human" → repeated low-confidence audio (N=2 failed attempts from Person A)
//           or dispatcher discretion
// null    → no escalation; normal routing flow

// ── Resource (Person C owns) ─────────────────────────────────────────────────

export interface Resource {
  id: string;
  name: string;
  type: "shelter" | "medical" | "distribution" | "evacuation";
  lat: number;
  lng: number;
  capacity: number;          // total beds/slots
  availableCapacity: number; // currently open slots
  /** Capabilities this resource can fulfil, e.g. ["water","beds","medical","meals"] */
  has: string[];
  address: string;
  phone?: string;
}

// ── Transcript (Person A emits, Person B consumes) ───────────────────────────

export interface Transcript {
  sessionId: string;
  text: string;
  isFinal: boolean;          // false = interim "typing" display; true = send to Brain
  confidence: number;        // 0–1 from Deepgram; < CONFIDENCE_THRESHOLD → reprompt
  timestamp: number;         // ms epoch
  language: "hi" | "en";    // always "hi" for RELAY demo; "en" fallback
}

// ── Triage (Person B produces, Person C + Map consume) ───────────────────────

export interface Triage {
  sessionId: string;

  // Extracted slots — null until the caller provides the information
  location: string | null;       // spoken landmark / neighbourhood
  locationLatLng: [number, number] | null; // geocoded by Person C
  numberOfPeople: number | null;
  natureOfEmergency: string | null;
  /** Needs the caller has expressed, e.g. ["water","shelter","medical"] */
  needs: string[];

  priority: Priority;

  /** Fields Brain still needs before routing */
  missingFields: Array<"location" | "numberOfPeople" | "natureOfEmergency" | "needs">;

  /** Hindi question Brain wants the operator/TTS to ask next */
  nextQuestion: string | null;

  /** True only when all critical slots are filled and priority is set */
  readyToRoute: boolean;

  escalate: EscalateTarget;

  updatedAt: number; // ms epoch
}

// ── Dispatch (Person C produces, Map consumes) ────────────────────────────────

export interface Dispatch {
  sessionId: string;
  matchedResource: Resource | null; // null if no suitable resource found
  /** Human-readable dispatch summary, e.g. "Family of 4, no water → Lincoln Shelter, 1.2 km, 8 beds" */
  dispatchText: string;
  /** Straight-line distance in km from caller to resource */
  distanceKm: number | null;
  /** Lat/lng of the caller as resolved by geocoding — never device GPS */
  callerLatLng: [number, number] | null;
  /** Ordered list of candidate resources considered (for UI "other options" panel) */
  candidates: Resource[];
  timestamp: number;
}

// ── Session (full lifecycle) ──────────────────────────────────────────────────

export type SessionStatus =
  | "idle"       // waiting for a call
  | "listening"  // mic active, Deepgram streaming
  | "processing" // audio received, Brain running
  | "triaged"    // Triage complete, Matchmaker running
  | "dispatched" // Dispatch complete, shown on map
  | "escalated"  // escalate: "911" or "human" triggered
  | "closed";    // call ended, session wiped from Redis

export interface Session {
  sessionId: string;
  startTime: number;
  status: SessionStatus;
  transcripts: Transcript[];
  triage: Triage | null;
  dispatch: Dispatch | null;
}

// ── WebSocket message types (Person A ↔ Person D) ─────────────────────────────
// All messages are JSON-serialised and sent over the WS connection.

export type WsMessageType =
  | "session_start"
  | "session_end"
  | "interim_transcript"
  | "final_transcript"
  | "triage_update"
  | "dispatch"
  | "escalation"
  | "reprompt"
  | "error";

export interface WsMessage {
  type: WsMessageType;
  sessionId?: string;
  // Present on interim_transcript / final_transcript
  transcript?: Transcript;
  // Present on triage_update
  triage?: Triage;
  // Present on dispatch
  dispatch?: Dispatch;
  // Present on escalation
  escalate?: EscalateTarget;
  escalationReason?: string;
  // Present on reprompt
  repromptMessage?: string; // e.g. "I didn't catch that, can you repeat?"
  // Present on error
  errorMessage?: string;
}
