/**
 * /api/triage — proxy to Person B's Brain service.
 *
 * During standalone dev this route can be called with a hardcoded transcript
 * to test the triage protocol before Person B's real backend is wired.
 *
 * POST body: { sessionId: string, transcript: string }
 * Response:  Triage object (§4 contract)
 */

import { NextRequest, NextResponse } from "next/server";

const BRAIN_URL = process.env.BRAIN_API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const upstream = await fetch(`${BRAIN_URL}/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Brain service error: ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const triage = await upstream.json();
    return NextResponse.json(triage);
  } catch (err) {
    console.error("[/api/triage]", err);
    return NextResponse.json(
      { error: "Brain service unreachable" },
      { status: 503 }
    );
  }
}
