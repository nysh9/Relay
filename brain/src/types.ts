// ─── RELAY Data Contracts (CLAUDE.md §4) ────────────────────────────────────
// These are the single source of truth. All stages build against these shapes.

// EAR → client / brain
export type Transcript = {
  text: string;
  language: string;
  isFinal: boolean;
  confidence: number;
};

// BRAIN output (Claude reads Hindi, emits English structured JSON only)
export type Triage = {
  summary: string;
  transcriptEnglish: string; // English translation of the caller's exact words
  people: number | null;           // null = not yet provided
  injuries: string | null;
  location: {
    text: string;
    lat?: number;
    lng?: number;
  } | null;
  needs: string[];                 // e.g. ["water", "shelter", "medical"]
  priority: "P1" | "P2" | "P3";  // Claude emits this in core; classifier replaces in stretch
  missingFields: string[];         // required slots still empty, e.g. ["location"]
  nextQuestion: string | null;     // follow-up to ask, in the CALLER's language (for TTS)
  nextQuestionEnglish: string | null; // English translation of nextQuestion (operator subtitle)
  readyToRoute: boolean;           // true only when all required slots are filled
  escalate: "none" | "human" | "911";
};

// MATCHMAKER output (deterministic TS — Person C owns this)
export type Dispatch = {
  matched: {
    resourceId: string;
    name: string;
    type: string;
    distanceKm: number;
    available: boolean;
  };
  alternatives: Array<{
    resourceId: string;
    name: string;
    distanceKm: number;
  }>;
  dispatchText: string; // "Family of 4, no water → Lincoln Shelter, 1.2km, 8 beds"
};

// RESOURCE dataset entry (Person C owns this + Redis schema)
export type Resource = {
  id: string;
  name: string;
  type: string;    // "shelter" | "medical" | "water" | ...
  lat: number;
  lng: number;
  capacity: number;
  has: string[];   // ["water", "beds", "medical"]
};

// SESSION MEMORY (Redis, per-session, wiped at session end — §2 privacy guardrail)
export type Session = {
  sessionId: string;
  partialTriage: Partial<Triage>;  // accumulates across utterances for the missingFields loop
};

// POST /triage request body
export type TriageRequest = {
  transcript: string;   // raw transcript text from the Ear
  sessionId: string;    // caller's session ID
  language?: string;    // BCP-47 code detected by Deepgram (e.g. "es", "hi"); drives nextQuestion language
};

// POST /triage response
export type TriageResponse = {
  triage: Triage;
  sessionId: string;
  transcript: string;
};
