"use client";

/**
 * RelayMap — Mapbox GL JS map for RELAY.
 *
 * Features:
 *  - Dark base style (swap URL once you have the custom style)
 *  - Houston bounding box: geocoding + map view locked to city limits
 *  - Caller pin: white dot that drops in with animation
 *  - Resource pins: color-coded by P1/P2/P3 priority
 *  - Animated routing line: dashed, draws from caller to matched resource
 *  - Match pulse: ring animation on the matched resource pin
 *  - 2D only — no pitch/bearing, no 3D buildings (§5.5)
 *
 * Dynamic import only — never runs on the server.
 * Parent page.tsx imports this with: next/dynamic + ssr: false
 */

import { useEffect, useRef } from "react";
import type mapboxgl from "mapbox-gl";
import type { Dispatch, Priority, Resource } from "@/types/contracts";

// Houston bounds: SW corner → NE corner
const HOUSTON_BOUNDS: [[number, number], [number, number]] = [
  [-95.7898, 29.5237], // SW
  [-95.0132, 30.1107], // NE
];

const HOUSTON_CENTER: [number, number] = [-95.3698, 29.7604];

// Priority → marker color
const PRIORITY_COLOR: Record<NonNullable<Priority> | "none", string> = {
  P1: "#EF4444",
  P2: "#F59E0B",
  P3: "#3B82F6",
  none: "#6B7280",
};

interface RelayMapProps {
  callerLatLng: [number, number] | null;
  matchedResource: Resource | null;
  allResources: Resource[];
  priority: Priority;
}

export function RelayMap({
  callerLatLng,
  matchedResource,
  allResources,
  priority,
}: RelayMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const initializedRef = useRef(false);

  // ── Init map ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    // Dynamic import so Mapbox GL only loads in browser
    import("mapbox-gl").then((mapboxModule) => {
      const mapboxgl = mapboxModule.default;

      mapboxgl.accessToken =
        process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

      const map = new mapboxgl.Map({
        container: containerRef.current!,
        // ── Swap this URL when you have the custom map style image ──
        // e.g. "mapbox://styles/your-username/your-style-id"
        style: "mapbox://styles/mapbox/dark-v11",
        center: HOUSTON_CENTER,
        zoom: 11,
        minZoom: 9,
        maxZoom: 16,
        // Lock pan to Houston
        maxBounds: [
          [HOUSTON_BOUNDS[0][0] - 0.5, HOUSTON_BOUNDS[0][1] - 0.5],
          [HOUSTON_BOUNDS[1][0] + 0.5, HOUSTON_BOUNDS[1][1] + 0.5],
        ],
        // 2D only — no pitch/bearing per §5.5
        pitch: 0,
        bearing: 0,
        // Disable rotation so operators can't accidentally tilt
        touchPitch: false,
        dragRotate: false,
      });

      // Navigation controls (zoom only, no rotation)
      map.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        "bottom-right"
      );

      map.on("load", () => {
        // Add route line source (empty to start)
        map.addSource("route", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": PRIORITY_COLOR[priority ?? "none"],
            "line-width": 2.5,
            "line-dasharray": [2, 2],
            "line-opacity": 0.85,
          },
        });
      });

      mapRef.current = map;
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update resource pins ───────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const waitForLoad = () => {
      // Clear old markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      import("mapbox-gl").then((mapboxModule) => {
        const mapboxgl = mapboxModule.default;

        allResources.forEach((resource) => {
          const isMatched = resource.id === matchedResource?.id;
          const color = PRIORITY_COLOR[priority ?? "none"];

          const el = document.createElement("div");
          el.className = "relay-resource-pin";
          el.style.cssText = `
            width: ${isMatched ? "20px" : "12px"};
            height: ${isMatched ? "20px" : "12px"};
            border-radius: 50%;
            background: ${isMatched ? color : "#374151"};
            border: 2px solid ${isMatched ? color : "#4B5563"};
            cursor: pointer;
            transition: transform 0.2s;
            ${isMatched ? `box-shadow: 0 0 0 0 ${color}80;` : ""}
          `;

          // Pulse animation on matched resource (CSS keyframe via style tag)
          if (isMatched) {
            el.style.animation = "matchPulse 2s ease-out infinite";
          }

          const popup = new mapboxgl.Popup({ offset: 10, closeButton: false })
            .setHTML(
              `<div style="background:#111827;color:#e5e7eb;padding:6px 10px;border-radius:6px;font-size:11px;line-height:1.5">
                <strong>${resource.name}</strong><br/>
                ${resource.availableCapacity} / ${resource.capacity} available<br/>
                ${resource.has.join(", ")}
              </div>`
            );

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([resource.lng, resource.lat])
            .setPopup(popup)
            .addTo(map);

          // Drop-in animation
          el.style.transform = "scale(0)";
          requestAnimationFrame(() => {
            el.style.transition = "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
            el.style.transform = "scale(1)";
          });

          markersRef.current.push(marker);
        });
      });
    };

    if (map.isStyleLoaded()) {
      waitForLoad();
    } else {
      map.once("load", waitForLoad);
    }
  }, [allResources, matchedResource, priority]);

  // ── Caller pin ────────────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !callerLatLng) return;

    const addCallerPin = () => {
      import("mapbox-gl").then((mapboxModule) => {
        const mapboxgl = mapboxModule.default;

        const el = document.createElement("div");
        el.style.cssText = `
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ffffff;
          border: 3px solid #9CA3AF;
          box-shadow: 0 0 12px rgba(255,255,255,0.4);
        `;

        // Pop in
        el.style.transform = "scale(0)";
        requestAnimationFrame(() => {
          el.style.transition = "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)";
          el.style.transform = "scale(1)";
        });

        new mapboxgl.Marker({ element: el })
          .setLngLat(callerLatLng)
          .setPopup(
            new mapboxgl.Popup({ offset: 10, closeButton: false }).setHTML(
              `<div style="background:#111827;color:#e5e7eb;padding:6px 10px;border-radius:6px;font-size:11px">Caller location</div>`
            )
          )
          .addTo(map);

        // Fly to caller location
        map.flyTo({
          center: callerLatLng,
          zoom: 12,
          speed: 1.2,
          curve: 1.4,
        });
      });
    };

    if (map.isStyleLoaded()) {
      addCallerPin();
    } else {
      map.once("load", addCallerPin);
    }
  }, [callerLatLng]);

  // ── Routing line ──────────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !callerLatLng || !matchedResource) return;

    const drawRoute = () => {
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                [callerLatLng[1], callerLatLng[0]],
                [matchedResource.lng, matchedResource.lat],
              ],
            },
          },
        ],
      };

      (map.getSource("route") as mapboxgl.GeoJSONSource | undefined)?.setData(
        geojson
      );

      // Update line color to match priority
      if (map.getLayer("route-line")) {
        map.setPaintProperty(
          "route-line",
          "line-color",
          PRIORITY_COLOR[priority ?? "none"]
        );
      }

      // Fit map to show both caller and resource
      map.fitBounds(
        [
          [
            Math.min(callerLatLng[1], matchedResource.lng) - 0.01,
            Math.min(callerLatLng[0], matchedResource.lat) - 0.01,
          ],
          [
            Math.max(callerLatLng[1], matchedResource.lng) + 0.01,
            Math.max(callerLatLng[0], matchedResource.lat) + 0.01,
          ],
        ],
        { padding: 80, duration: 1200 }
      );
    };

    if (map.isStyleLoaded()) {
      drawRoute();
    } else {
      map.once("load", drawRoute);
    }
  }, [callerLatLng, matchedResource, priority]);

  return (
    <>
      {/* Inject pulse keyframe once */}
      <style>{`
        @keyframes matchPulse {
          0%   { box-shadow: 0 0 0 0 currentColor; }
          70%  { box-shadow: 0 0 0 10px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
        .mapboxgl-popup-content {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .mapboxgl-popup-tip { display: none !important; }
      `}</style>

      {/* Map container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Prototype badge — §2 demo honesty, always visible */}
      <div className="absolute bottom-10 left-3 px-2 py-1 rounded text-[9px] text-gray-500 bg-relay-bg/80 border border-relay-border pointer-events-none">
        Prototype · Mock dataset · Houston, TX
      </div>
    </>
  );
}
