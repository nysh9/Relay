// ─── Shared data contracts (mirror of /src/types/contracts.ts §4) ────────────
// The matchmaker is its own npm package, so we keep a local copy of the locked
// contract shapes it depends on (same pattern brain/src/types.ts uses). Only the
// types the Matchmaker actually touches are mirrored here. Do NOT diverge field
// names from /src/types/contracts.ts — that file is the team source of truth.
// ─────────────────────────────────────────────────────────────────────────────

export type Priority = 'P1' | 'P2' | 'P3' | null;
export type EscalateTarget = '911' | 'human' | null;

export interface Resource {
  id: string;
  name: string;
  type: 'shelter' | 'medical' | 'distribution' | 'evacuation';
  lat: number;
  lng: number;
  capacity: number;
  availableCapacity: number;
  has: string[];
  address: string;
  phone?: string;
}

export interface Dispatch {
  sessionId: string;
  matchedResource: Resource | null;
  dispatchText: string;
  distanceKm: number | null;
  callerLatLng: [number, number] | null;
  candidates: Resource[];
  timestamp: number;
}

// ─── Tolerant triage input ───────────────────────────────────────────────────
// The Matchmaker accepts a Triage from either the locked frontend contract
// (numberOfPeople, location:string, locationLatLng) OR the Brain's own
// types.ts shape (people, location:{text,lat,lng}). We read both defensively so
// an integration mismatch between Person B and Person D never breaks routing.
export interface TriageInput {
  sessionId?: string;

  // needs is the one field both shapes agree on
  needs?: string[];

  // frontend-contract shape
  location?: string | { text?: string; lat?: number; lng?: number } | null;
  locationLatLng?: [number, number] | null;
  numberOfPeople?: number | null;

  // brain types.ts shape
  people?: number | null;

  priority?: Priority;
}
