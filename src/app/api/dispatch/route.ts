/**
 * /api/dispatch — runs Person C's Matchmaker in-process + shape adapter.
 *
 * Takes the caller's needs + spoken location, geocodes the location (Mapbox),
 * runs the deterministic findMatch() over the Houston resource dataset, then
 * enriches the result into the frontend Dispatch contract (full Resource
 * objects + callerLatLng) so the map can render pins and the routing line.
 *
 * POST body: { needs: string[], location: string, sessionId: string }
 * Response:  Dispatch (contracts.ts shape)
 */

import { NextRequest, NextResponse } from "next/server";
import { geocodeLocation } from "../../../../lib/geocode";
import { findMatch } from "../../../../lib/matchmaker";
import resourcesData from "../../../../data/resources.json";
import type { Resource as MatchResource } from "../../../../types";
import type { Dispatch, Resource } from "@/types/contracts";

const resources = resourcesData as MatchResource[];

function lookup(id: string): Resource | null {
  const r = resources.find((res) => res.id === id);
  return (r as unknown as Resource) ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const { needs, location, sessionId } = (await req.json()) as {
      needs?: string[];
      location?: string;
      sessionId?: string;
    };

    if (!location || !needs || needs.length === 0) {
      return NextResponse.json(
        { error: "needs and location are required to route" },
        { status: 400 }
      );
    }

    // Caller location ALWAYS comes from the call text, never device GPS (§5.5).
    const callerLoc = await geocodeLocation(location);

    // Deterministic match — never invents a resource (§2 guardrail).
    const result = findMatch(needs, callerLoc, resources);

    const matchedResource = result.matched ? lookup(result.matched.resourceId) : null;
    const candidates: Resource[] = [];
    if (matchedResource) candidates.push(matchedResource);
    for (const alt of result.alternatives) {
      const r = lookup(alt.resourceId);
      if (r) candidates.push(r);
    }

    const dispatch: Dispatch = {
      sessionId: sessionId ?? "",
      matchedResource,
      dispatchText: result.dispatchText,
      distanceKm: result.matched?.distanceKm ?? null,
      callerLatLng: [callerLoc.lat, callerLoc.lng],
      candidates,
      timestamp: Date.now(),
    };

    return NextResponse.json(dispatch);
  } catch (err) {
    console.error("[/api/dispatch]", err);
    return NextResponse.json(
      { error: "Matchmaker failed", detail: String(err) },
      { status: 500 }
    );
  }
}
