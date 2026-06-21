/**
 * mockData.ts — hardcoded fake pipeline output for standalone UI dev.
 *
 * Person D uses this so the map + panels render correctly before
 * Persons A, B, and C have their backends running.
 *
 * Set NEXT_PUBLIC_DEMO_MODE=true in .env.local to activate.
 * The main page page.tsx checks this flag on mount.
 */

import type { Dispatch, Resource, Session, Transcript, Triage } from "@/types/contracts";

// A realistic Houston shelter
export const MOCK_RESOURCE: Resource = {
  id: "hou-shelter-001",
  name: "George R. Brown Convention Center",
  type: "shelter",
  lat: 29.7537,
  lng: -95.3583,
  capacity: 500,
  availableCapacity: 87,
  has: ["beds", "water", "meals", "medical"],
  address: "1001 Avenida De Las Americas, Houston, TX 77010",
  phone: "(713) 853-8000",
};

export const MOCK_SESSION_ID = "demo-session-001";

export const MOCK_TRANSCRIPTS: Transcript[] = [
  {
    sessionId: MOCK_SESSION_ID,
    text: "Namaste, mujhe madad chahiye —",
    isFinal: false,
    confidence: 0.91,
    timestamp: Date.now() - 12000,
    language: "hi",
  },
  {
    sessionId: MOCK_SESSION_ID,
    text: "Namaste, mujhe madad chahiye, hamare paas paani nahi hai.",
    isFinal: true,
    confidence: 0.94,
    timestamp: Date.now() - 10000,
    language: "hi",
  },
  {
    sessionId: MOCK_SESSION_ID,
    text: "Hum Buffalo Bayou ke paas hain, chaaron log hain.",
    isFinal: true,
    confidence: 0.89,
    timestamp: Date.now() - 6000,
    language: "hi",
  },
];

export const MOCK_TRIAGE: Triage = {
  sessionId: MOCK_SESSION_ID,
  location: "Buffalo Bayou",
  locationLatLng: [29.7604, -95.3698],
  numberOfPeople: 4,
  natureOfEmergency: "Flood displacement — no water access",
  needs: ["water", "shelter"],
  priority: "P2",
  missingFields: [],
  nextQuestion: null,
  readyToRoute: true,
  escalate: null,
  updatedAt: Date.now() - 4000,
};

export const MOCK_DISPATCH: Dispatch = {
  sessionId: MOCK_SESSION_ID,
  matchedResource: MOCK_RESOURCE,
  dispatchText:
    "Family of 4, no water → George R. Brown Convention Center, 2.1 km, 87 beds available",
  distanceKm: 2.1,
  callerLatLng: [29.7604, -95.3698],
  candidates: [MOCK_RESOURCE],
  timestamp: Date.now() - 2000,
};

export const MOCK_SESSION: Session = {
  sessionId: MOCK_SESSION_ID,
  startTime: Date.now() - 15000,
  status: "dispatched",
  transcripts: MOCK_TRANSCRIPTS,
  triage: MOCK_TRIAGE,
  dispatch: MOCK_DISPATCH,
};
