"use client";

/**
 * DispatchPanel — shows the matched resource from Person C (Matchmaker).
 *
 * Renders:
 *  - Dispatch summary text
 *  - Matched resource name + type + distance
 *  - Available capacity bar
 *  - Capability tags
 *  - "Other options" list (candidates minus the top match)
 *
 * Only renders once dispatch is non-null (Matchmaker has responded).
 */

import clsx from "clsx";
import type { Dispatch, Resource } from "@/types/contracts";

interface DispatchPanelProps {
  dispatch: Dispatch | null;
}

export function DispatchPanel({ dispatch }: DispatchPanelProps) {
  if (!dispatch) return null;

  const { matchedResource, dispatchText, distanceKm, candidates } = dispatch;
  const others = candidates.filter((c) => c.id !== matchedResource?.id);

  return (
    <section className="animate-slide-in">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-relay-border">
        <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Dispatch
        </h2>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Summary text from Matchmaker */}
        <p className="text-xs text-gray-300 leading-relaxed border-l-2 border-green-700 pl-3">
          {dispatchText}
        </p>

        {/* Matched resource card */}
        {matchedResource && (
          <ResourceCard resource={matchedResource} distanceKm={distanceKm} primary />
        )}

        {/* No match */}
        {!matchedResource && (
          <p className="text-xs text-gray-500 italic">
            No matching resource found in dataset.
          </p>
        )}

        {/* Other candidates */}
        {others.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider">
              Other options
            </p>
            {others.map((r) => (
              <ResourceCard key={r.id} resource={r} distanceKm={null} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Resource card ─────────────────────────────────────────────────────────────

function ResourceCard({
  resource,
  distanceKm,
  primary = false,
}: {
  resource: Resource;
  distanceKm: number | null;
  primary?: boolean;
}) {
  const capacityPct = Math.round(
    (resource.availableCapacity / resource.capacity) * 100
  );

  const typeLabel: Record<Resource["type"], string> = {
    shelter: "Shelter",
    medical: "Medical",
    distribution: "Distribution",
    evacuation: "Evacuation",
  };

  return (
    <div
      className={clsx(
        "rounded-md border p-2.5 space-y-2",
        primary
          ? "border-green-700/50 bg-green-950/30"
          : "border-relay-border bg-relay-panel/50"
      )}
    >
      {/* Name + distance */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p
            className={clsx(
              "text-xs font-semibold",
              primary ? "text-green-300" : "text-gray-300"
            )}
          >
            {resource.name}
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {typeLabel[resource.type]} · {resource.address}
          </p>
        </div>
        {distanceKm !== null && (
          <span className="text-[10px] text-gray-400 whitespace-nowrap font-mono">
            {distanceKm.toFixed(1)} km
          </span>
        )}
      </div>

      {/* Capacity bar */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>Capacity</span>
          <span>
            {resource.availableCapacity} / {resource.capacity} available
          </span>
        </div>
        <div className="h-1 rounded-full bg-gray-800">
          <div
            className={clsx(
              "h-1 rounded-full transition-all",
              capacityPct > 40 ? "bg-green-500" : capacityPct > 15 ? "bg-amber-500" : "bg-red-500"
            )}
            style={{ width: `${capacityPct}%` }}
          />
        </div>
      </div>

      {/* Capability tags */}
      <div className="flex flex-wrap gap-1">
        {resource.has.map((cap) => (
          <span
            key={cap}
            className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide bg-gray-800 text-gray-400"
          >
            {cap}
          </span>
        ))}
      </div>
    </div>
  );
}
