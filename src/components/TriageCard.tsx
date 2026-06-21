"use client";

/**
 * TriageCard — shows the structured triage state from Person B (Brain).
 *
 * Renders:
 *  - P1/P2/P3 priority chip (color-coded)
 *  - Extracted slots: location, people, nature, needs
 *  - Missing fields with the Brain's nextQuestion in Hindi
 *  - "Ready to route" indicator
 *
 * Animates in when triage first appears; slots animate individually.
 */

import clsx from "clsx";
import type { Priority, Triage } from "@/types/contracts";

interface TriageCardProps {
  triage: Triage | null;
}

export function TriageCard({ triage }: TriageCardProps) {
  if (!triage) return null;

  return (
    <section className="animate-slide-in">
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-relay-border">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Triage
        </h2>
        <PriorityChip priority={triage.priority} />
        {triage.readyToRoute && (
          <span className="ml-auto text-[10px] text-green-400 font-mono uppercase tracking-wide">
            ✓ Ready to route
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {/* Slots */}
        <SlotRow
          label="Location"
          value={triage.location}
          missing={triage.missingFields.includes("location")}
        />
        <SlotRow
          label="People"
          value={
            triage.numberOfPeople !== null
              ? String(triage.numberOfPeople)
              : null
          }
          missing={triage.missingFields.includes("numberOfPeople")}
        />
        <SlotRow
          label="Nature"
          value={triage.natureOfEmergency}
          missing={triage.missingFields.includes("natureOfEmergency")}
        />
        <SlotRow
          label="Needs"
          value={triage.needs.length > 0 ? triage.needs.join(", ") : null}
          missing={triage.missingFields.includes("needs")}
        />

        {/* Follow-up question from Brain */}
        {triage.nextQuestion && (
          <div className="mt-1 px-3 py-2 rounded-md bg-blue-950/50 border border-blue-800/40 text-blue-300 text-xs animate-slide-in">
            <span className="text-blue-500 font-semibold mr-1">Ask:</span>
            {triage.nextQuestion}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Priority chip ──────────────────────────────────────────────────────────────

function PriorityChip({ priority }: { priority: Priority }) {
  if (!priority) return null;

  const styles: Record<NonNullable<Priority>, string> = {
    P1: "bg-red-900/60 text-red-300 border-red-700/50",
    P2: "bg-amber-900/60 text-amber-300 border-amber-700/50",
    P3: "bg-blue-900/60 text-blue-300 border-blue-700/50",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
        styles[priority]
      )}
    >
      {priority}
    </span>
  );
}

// ── Slot row ───────────────────────────────────────────────────────────────────

function SlotRow({
  label,
  value,
  missing,
}: {
  label: string;
  value: string | null;
  missing: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-16 flex-shrink-0 text-gray-500 pt-0.5">{label}</span>
      {value ? (
        <span className="text-gray-100 leading-relaxed">{value}</span>
      ) : (
        <span
          className={clsx(
            "italic",
            missing ? "text-yellow-600" : "text-gray-600"
          )}
        >
          {missing ? "missing" : "—"}
        </span>
      )}
    </div>
  );
}
