/**
 * /api/dispatch — proxy to Person C's Matchmaker service.
 *
 * POST body: Triage object (§4 contract) — sent once readyToRoute: true
 * Response:  Dispatch object (§4 contract)
 */

import { NextRequest, NextResponse } from "next/server";

const MATCHMAKER_URL = process.env.MATCHMAKER_API_URL ?? "http://localhost:3002";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const upstream = await fetch(`${MATCHMAKER_URL}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Matchmaker service error: ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const dispatch = await upstream.json();
    return NextResponse.json(dispatch);
  } catch (err) {
    console.error("[/api/dispatch]", err);
    return NextResponse.json(
      { error: "Matchmaker service unreachable" },
      { status: 503 }
    );
  }
}
