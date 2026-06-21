"use client";

/**
 * EscalationBanner — the guardrail made visible (§5.5 / §2).
 *
 * This is NOT an afterthought — it gets real screen presence.
 * Renders as a full-width overlay that demands operator attention.
 *
 * "911" escalation:  red — active emergency, route to emergency services
 * "human" escalation: purple — low-confidence audio, human operator needed
 *
 * The banner does NOT auto-dismiss. An operator must explicitly acknowledge.
 */

import clsx from "clsx";
import type { EscalateTarget } from "@/types/contracts";

interface EscalationBannerProps {
  escalate: EscalateTarget;
  reason?: string;
  onAcknowledge: () => void;
}

export function EscalationBanner({
  escalate,
  reason,
  onAcknowledge,
}: EscalationBannerProps) {
  if (!escalate) return null;

  const is911 = escalate === "911";

  return (
    // Overlay — full width, positioned above the main content in the sidebar
    <div
      className={clsx(
        "relative flex flex-col gap-3 px-4 py-4 border-l-4 animate-slide-in",
        is911
          ? "bg-red-950/80 border-red-500 text-red-100"
          : "bg-purple-950/80 border-purple-500 text-purple-100"
      )}
      role="alert"
      aria-live="assertive"
    >
      {/* Pulsing indicator + label */}
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            "inline-flex h-4 w-4 rounded-full animate-pulse",
            is911 ? "bg-red-400" : "bg-purple-400"
          )}
        />
        <span className="text-xs font-bold uppercase tracking-widest">
          {is911 ? "🚨 Emergency — Route to 911" : "👤 Transfer to Human Operator"}
        </span>
      </div>

      {/* What triggered it */}
      <p className="text-xs leading-relaxed opacity-80">
        {is911
          ? reason ??
            "Active emergency detected outside mass-care scope. Do NOT attempt to route through RELAY — contact emergency services immediately."
          : reason ??
            "Audio confidence below threshold after multiple attempts. A human operator is needed to continue this call."}
      </p>

      {/* Action */}
      <button
        onClick={onAcknowledge}
        className={clsx(
          "self-start px-3 py-1.5 rounded text-xs font-semibold border transition-colors",
          is911
            ? "border-red-500 text-red-200 hover:bg-red-800"
            : "border-purple-500 text-purple-200 hover:bg-purple-800"
        )}
      >
        {is911 ? "Acknowledged — 911 Contacted" : "Acknowledged — Transferring"}
      </button>

      {/* Prototype caveat — §2 demo honesty */}
      <p className="text-[9px] opacity-40 italic">
        Prototype · Mock dataset · Real escalation requires integration with live
        dispatch systems
      </p>
    </div>
  );
}
