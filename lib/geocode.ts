import type { CallerLocation } from "../types";

// ─── Houston bounding box ─────────────────────────────────────────────────────
// [minLng, minLat, maxLng, maxLat] — restricts geocoding to Houston only.
// This keeps the demo consistent: a caller's stated location always resolves
// INSIDE our dataset's city, never near the judge's real location.
const HOUSTON_BBOX = [-95.7891, 29.5230, -95.0145, 30.1100];

// Fallback point (downtown Houston) if geocoding fails or returns nothing.
const HOUSTON_CENTER = { lat: 29.7589, lng: -95.3677 };

// ─── Geocode a caller's spoken location ───────────────────────────────────────
// Takes the location string the CALLER speaks (e.g. "near Buffalo Bayou") and
// resolves it to a lat/lng inside the Houston bounding box.
//
// IMPORTANT (§5.5): Caller location ALWAYS comes from the call, never device GPS.
// The caller is virtual/remote; their location is whatever they tell us. We bound
// it to Houston so routing stays inside the frozen demo dataset.
export async function geocodeLocation(
  locationText: string
): Promise<CallerLocation> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    throw new Error("MAPBOX_TOKEN is not set in .env.local");
  }

  const query = encodeURIComponent(locationText);
  const bbox = HOUSTON_BBOX.join(",");

  // proximity biases results toward downtown; bbox hard-restricts to Houston.
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json` +
    `?access_token=${token}` +
    `&bbox=${bbox}` +
    `&proximity=${HOUSTON_CENTER.lng},${HOUSTON_CENTER.lat}` +
    `&limit=1`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    // No result → fall back to city center rather than guessing or failing.
    if (!data.features || data.features.length === 0) {
      console.warn(`[geocode] No result for "${locationText}", using city center.`);
      return { text: locationText, ...HOUSTON_CENTER };
    }

    // Mapbox returns coordinates as [lng, lat]
    const [lng, lat] = data.features[0].center;
    return { text: locationText, lat, lng };
  } catch (err) {
    console.error(`[geocode] Failed for "${locationText}":`, err);
    return { text: locationText, ...HOUSTON_CENTER };
  }
}