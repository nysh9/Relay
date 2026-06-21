export type Resource = {
  id: string;
  name: string;
  type: "shelter" | "medical" | "water" | "supply" | "evacuation";
  lat: number;
  lng: number;
  capacity: number;
  availableCapacity: number;
  has: string[];
  address: string;
  phone?: string;
};

export type CallerLocation = {
  text: string;   // what the caller said — always from the call, never device GPS
  lat: number;
  lng: number;
};

export type ResourceMatch = {
  resourceId: string;
  name: string;
  type: string;
  distanceKm: number;
  available: boolean;
};

export type Dispatch = {
  matched: ResourceMatch | null;   // null = nothing fits (guardrail — never fabricate)
  alternatives: Array<{ resourceId: string; name: string; distanceKm: number }>;
  dispatchText: string;
};