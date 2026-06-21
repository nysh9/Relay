// ─── Houston geocoder (gazetteer) ────────────────────────────────────────────
// Location ALWAYS comes from the call, never device GPS (§5.5). The caller is
// virtual and pinned inside Houston. We resolve a spoken location string to a
// lat/lng using a small built-in gazetteer of Houston neighborhoods/landmarks —
// no Mapbox key, no network, no failure point. Anything we can't match falls
// back to downtown Houston so the demo always has a caller pin.
//
// Real deployment would swap this for Mapbox geocoding restricted to the Houston
// bounding box; the interface (string → [lat,lng]) stays identical.
// ─────────────────────────────────────────────────────────────────────────────

// Downtown Houston — the default pin when nothing else matches.
const DOWNTOWN_HOUSTON: [number, number] = [29.7589, -95.3677];

// Lowercased substring → [lat, lng]. Order doesn't matter; first substring hit wins.
const GAZETTEER: Array<{ keys: string[]; latLng: [number, number] }> = [
  { keys: ['downtown'], latLng: [29.7589, -95.3677] },
  { keys: ['midtown'], latLng: [29.7375, -95.3766] },
  { keys: ['montrose'], latLng: [29.7444, -95.3905] },
  { keys: ['the heights', 'houston heights', 'heights'], latLng: [29.7905, -95.3988] },
  { keys: ['east end', 'eastend', 'second ward', 'magnolia park'], latLng: [29.7322, -95.3199] },
  { keys: ['third ward'], latLng: [29.7261, -95.3563] },
  { keys: ['fifth ward'], latLng: [29.7805, -95.3286] },
  { keys: ['sharpstown'], latLng: [29.7032, -95.5305] },
  { keys: ['alief'], latLng: [29.6889, -95.5915] },
  { keys: ['gulfton'], latLng: [29.7164, -95.4861] },
  { keys: ['sunnyside'], latLng: [29.6624, -95.3477] },
  { keys: ['acres homes', 'acres home'], latLng: [29.8458, -95.4356] },
  { keys: ['kashmere'], latLng: [29.8027, -95.3169] },
  { keys: ['greenspoint', 'aldine'], latLng: [29.9105, -95.4012] },
  { keys: ['medical center', 'texas medical', 'tmc'], latLng: [29.7108, -95.3995] },
  { keys: ['museum district'], latLng: [29.7256, -95.3902] },
  { keys: ['galleria', 'uptown'], latLng: [29.7402, -95.4618] },
  { keys: ['memorial'], latLng: [29.7647, -95.4502] },
  { keys: ['katy'], latLng: [29.7858, -95.8245] },
  { keys: ['pasadena'], latLng: [29.6911, -95.2091] },
  { keys: ['baytown'], latLng: [29.7355, -94.9774] },
  { keys: ['spring branch'], latLng: [29.8027, -95.5152] },
  { keys: ['near northside', 'northside'], latLng: [29.7916, -95.3573] },
  { keys: ['nrg', 'astrodome'], latLng: [29.6847, -95.4107] },
  { keys: ['convention center', 'george r. brown', 'george r brown'], latLng: [29.7525, -95.3573] },
];

/**
 * Resolve a spoken location string to a Houston lat/lng.
 * Returns DOWNTOWN_HOUSTON for empty/unrecognized input so the demo never
 * lacks a caller pin. Matching is case-insensitive substring containment.
 */
export function geocodeHouston(location: string | null | undefined): [number, number] {
  if (!location) return DOWNTOWN_HOUSTON;
  const q = location.toLowerCase();
  for (const entry of GAZETTEER) {
    if (entry.keys.some((k) => q.includes(k))) {
      return entry.latLng;
    }
  }
  return DOWNTOWN_HOUSTON;
}

/** Haversine great-circle distance in km between two lat/lng points. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371; // Earth radius, km
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
