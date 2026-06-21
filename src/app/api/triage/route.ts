/**
 * /api/triage — proxy to Person B's Brain service + shape adapter.
 *
 * The Brain (brain/) speaks the CLAUDE.md §4 Triage shape; the RELAY UI consumes
 * the (different) src/types/contracts.ts Triage shape. This route bridges them:
 *   1. POST {transcript, sessionId} → Brain /triage
 *   2. Adapt the Brain's Triage → the frontend Triage contract
 *
 * POST body: { transcript: string, sessionId: string }
 * Response:  Triage (contracts.ts shape)
 */

import { NextRequest, NextResponse } from "next/server";
import type { Triage } from "@/types/contracts";

// Brain runs on 4001 (outside Next's 3000–3002 auto-increment range, so a
// bumped `next dev` can't take its port). Override with BRAIN_API_URL if needed.
const BRAIN_URL = process.env.BRAIN_API_URL ?? "http://localhost:4001";

// The CLAUDE.md §4 Triage shape the Brain actually emits.
type BrainTriage = {
  summary: string;
  transcriptEnglish: string;
  people: number | null;
  injuries: string | null;
  location: { text: string; lat?: number; lng?: number } | null;
  needs: string[];
  priority: "P1" | "P2" | "P3";
  missingFields: string[];
  nextQuestion: string | null;
  nextQuestionEnglish: string | null;
  readyToRoute: boolean;
  escalate: "none" | "human" | "911";
};

// Brain missingFields use "people"; the UI contract uses "numberOfPeople".
function mapMissingField(f: string): Triage["missingFields"][number] | null {
  switch (f) {
    case "location":
      return "location";
    case "people":
    case "numberOfPeople":
      return "numberOfPeople";
    case "needs":
      return "needs";
    case "natureOfEmergency":
      return "natureOfEmergency";
    default:
      return null;
  }
}

function adaptBrainTriage(b: BrainTriage, sessionId: string): Triage {
  const lat = b.location?.lat;
  const lng = b.location?.lng;
  return {
    sessionId,
    location: b.location?.text ?? null,
    locationLatLng:
      typeof lat === "number" && typeof lng === "number" ? [lat, lng] : null,
    numberOfPeople: b.people,
    natureOfEmergency: b.summary ?? null,
    needs: b.needs ?? [],
    priority: b.priority,
    missingFields: (b.missingFields ?? [])
      .map(mapMissingField)
      .filter((f): f is Triage["missingFields"][number] => f !== null),
    nextQuestion: b.nextQuestion,
    nextQuestionEnglish: b.nextQuestionEnglish ?? null,
    readyToRoute: b.readyToRoute,
    escalate: b.escalate === "none" ? null : b.escalate,
    updatedAt: Date.now(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const { transcript, sessionId, language } = (await req.json()) as {
      transcript?: string;
      sessionId?: string;
      language?: string;
    };

    if (!transcript || !sessionId) {
      return NextResponse.json(
        { error: "transcript and sessionId are required" },
        { status: 400 }
      );
    }

    const upstream = await fetch(`${BRAIN_URL}/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, sessionId, language }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: `Brain service error: ${upstream.status}`, detail },
        { status: upstream.status }
      );
    }

    // Brain returns { triage, sessionId, transcript }
    const { triage } = (await upstream.json()) as { triage: BrainTriage };
    return NextResponse.json(adaptBrainTriage(triage, sessionId));
  } catch (err) {
    console.error("[/api/triage]", err);
    return NextResponse.json(
      { error: "Brain service unreachable" },
      { status: 503 }
    );
  }
}
