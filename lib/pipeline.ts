import { geocodeLocation } from "./geocode";
import { findMatch } from "./matchmaker";
import resources from "../data/resources.json";
import type { Resource, Dispatch } from "../types";

// Person B's Triage type lives in their brain folder. We import THEIR contract
// so the connector always matches what the Brain actually emits.
import type { Triage } from "../brain/src/types";

// ─── Connector: Triage → Dispatch ─────────────────────────────────────────────
// Joins Person B's Brain output to Person C's Matchmaker. This is the only new
// code needed to chain the two stages — both sides already built to §4 contracts.
//
// Returns null when routing should NOT happen (Brain still gathering info, or an
// escalation is in play). Person D's UI handles the null / escalation surfaces.
export async function triageToDispatch(triage: Triage): Promise<Dispatch | null> {
  // GUARDRAIL: only route when the Brain says required slots are filled.
  if (!triage.readyToRoute) return null;

  // GUARDRAIL: escalation beats routing. Don't send a 911/human case to a shelter.
  if (triage.escalate !== "none") return null;

  // GUARDRAIL: no location → can't route. Brain should have set a nextQuestion.
  if (!triage.location) return null;

  // Caller location ALWAYS comes from the call text, never device GPS (§5.5).
  const callerLocation = await geocodeLocation(triage.location.text);

  // Hand off to the deterministic Matchmaker (the moat).
  return findMatch(triage.needs, callerLocation, resources as Resource[]);
}