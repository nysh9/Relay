"use client";

/**
 * page.tsx — RELAY main page (Person D integration layer).
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  Header: RELAY wordmark · session status · ws badge  │
 *   ├──────────────────────┬──────────────────────────────┤
 *   │  Sidebar (40%)       │  Map (60%)                   │
 *   │  ─ EscalationBanner  │  RelayMap (Mapbox GL)        │
 *   │  ─ TranscriptPanel   │                              │
 *   │  ─ TriageCard        │                              │
 *   │  ─ DispatchPanel     │                              │
 *   │  ─ Call controls     │                              │
 *   └──────────────────────┴──────────────────────────────┘
 *
 * The RelayMap is dynamically imported (no SSR) because Mapbox GL
 * requires a browser DOM.
 *
 * DEMO_MODE=true (default) → loads mock data, no backend needed.
 * DEMO_MODE=false          → connects to Person A's WS server.
 */

import dynamic from "next/dynamic";
import clsx from "clsx";
import { useRelay } from "@/hooks/useRelay";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { TriageCard } from "@/components/TriageCard";
import { DispatchPanel } from "@/components/DispatchPanel";
import { EscalationBanner } from "@/components/EscalationBanner";
import { MOCK_RESOURCE } from "@/lib/mockData";
import type { WsStatus } from "@/hooks/useWebSocket";

// Dynamic import — Mapbox GL must never run on server
const RelayMap = dynamic(
  () => import("@/components/RelayMap").then((m) => m.RelayMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-relay-bg flex items-center justify-center">
        <span className="text-gray-600 text-sm">Loading map…</span>
      </div>
    ),
  }
);

export default function Page() {
  const {
    session,
    wsStatus,
    repromptMessage,
    isDemoMode,
    startCall,
    endCall,
    runMockDemo,
  } = useRelay();

  const { triage, dispatch, transcripts, status } = session;
  const escalate = triage?.escalate ?? null;
  const priority = triage?.priority ?? null;

  // Resources to show on map: matched resource + any candidates
  const mapResources =
    dispatch?.candidates.length
      ? dispatch.candidates
      : dispatch?.matchedResource
      ? [dispatch.matchedResource]
      : isDemoMode
      ? [MOCK_RESOURCE]
      : [];

  return (
    <div className="flex flex-col h-full bg-relay-bg text-gray-100 overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-5 py-3 border-b border-relay-border flex-shrink-0 z-10">
        {/* Wordmark */}
        <div className="flex items-center gap-2.5">
          <span className="text-base font-bold tracking-tight text-white">
            RE<span className="text-relay-accent">LAY</span>
          </span>
          <span className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">
            Disaster Response
          </span>
        </div>

        <div className="flex-1" />

        {/* Demo mode badge */}
        {isDemoMode && (
          <span className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-amber-900/40 text-amber-400 border border-amber-800/50">
            Demo mode
          </span>
        )}

        {/* Session status */}
        <SessionStatusBadge status={status} />

        {/* WS connection badge */}
        <WsBadge status={wsStatus} isDemoMode={isDemoMode} />
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ─────────────────────────────────────────────── */}
        <aside className="w-[400px] flex-shrink-0 flex flex-col border-r border-relay-border bg-relay-panel overflow-y-auto">

          {/* Escalation — top of sidebar, full prominence */}
          {escalate && (
            <EscalationBanner
              escalate={escalate}
              onAcknowledge={() => {
                // In a real system this would call a backend endpoint to log the ACK.
                // For demo: just log to console.
                console.log("[RELAY] Escalation acknowledged:", escalate);
              }}
            />
          )}

          {/* Transcript */}
          <div
            className={clsx(
              "flex-shrink-0 border-b border-relay-border",
              escalate ? "max-h-48" : "max-h-56"
            )}
          >
            <TranscriptPanel
              transcripts={transcripts}
              repromptMessage={repromptMessage}
              isListening={status === "listening"}
            />
          </div>

          {/* Triage */}
          {triage && (
            <div className="flex-shrink-0 border-b border-relay-border">
              <TriageCard triage={triage} />
            </div>
          )}

          {/* Dispatch */}
          {dispatch && (
            <div className="flex-shrink-0 border-b border-relay-border">
              <DispatchPanel dispatch={dispatch} />
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* ── Call controls ─────────────────────────────────────────── */}
          <div className="px-4 py-4 border-t border-relay-border space-y-2 flex-shrink-0">
            {isDemoMode ? (
              // Demo controls
              <div className="space-y-2">
                <button
                  onClick={runMockDemo}
                  className="w-full py-2 rounded-md text-sm font-semibold bg-relay-accent hover:bg-relay-accent-dim transition-colors text-white"
                >
                  ▶ Run Demo Script
                </button>
                <p className="text-[10px] text-gray-600 text-center">
                  Animates the hero call end-to-end · safe for rehearsal
                </p>
              </div>
            ) : status === "idle" || status === "closed" ? (
              <button
                onClick={startCall}
                className="w-full py-2 rounded-md text-sm font-semibold bg-green-700 hover:bg-green-600 transition-colors text-white"
              >
                Start Call
              </button>
            ) : (
              <button
                onClick={endCall}
                className="w-full py-2 rounded-md text-sm font-semibold bg-red-800 hover:bg-red-700 transition-colors text-white"
              >
                End Call
              </button>
            )}
          </div>
        </aside>

        {/* ── Map ─────────────────────────────────────────────────────── */}
        <main className="flex-1 relative overflow-hidden">
          <RelayMap
            callerLatLng={
              dispatch?.callerLatLng ??
              triage?.locationLatLng ??
              null
            }
            matchedResource={dispatch?.matchedResource ?? null}
            allResources={mapResources}
            priority={priority}
          />
        </main>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SessionStatusBadge({ status }: { status: string }) {
  const LABELS: Record<string, { label: string; color: string }> = {
    idle: { label: "Idle", color: "text-gray-500" },
    listening: { label: "Listening", color: "text-green-400" },
    processing: { label: "Processing", color: "text-blue-400" },
    triaged: { label: "Triaged", color: "text-amber-400" },
    dispatched: { label: "Dispatched", color: "text-green-400" },
    escalated: { label: "Escalated", color: "text-red-400" },
    closed: { label: "Closed", color: "text-gray-500" },
  };
  const s = LABELS[status] ?? { label: status, color: "text-gray-400" };
  return (
    <span className={clsx("text-[11px] font-mono uppercase tracking-wider", s.color)}>
      {s.label}
    </span>
  );
}

function WsBadge({
  status,
  isDemoMode,
}: {
  status: WsStatus;
  isDemoMode: boolean;
}) {
  if (isDemoMode) return null;

  const STYLES: Record<WsStatus, { dot: string; label: string }> = {
    open: { dot: "bg-green-400", label: "Live" },
    connecting: { dot: "bg-yellow-400 animate-pulse", label: "Connecting" },
    closed: { dot: "bg-gray-600", label: "Offline" },
    error: { dot: "bg-red-500", label: "Error" },
  };
  const s = STYLES[status];
  return (
    <div className="flex items-center gap-1.5">
      <span className={clsx("inline-block h-1.5 w-1.5 rounded-full", s.dot)} />
      <span className="text-[10px] text-gray-500 font-mono">{s.label}</span>
    </div>
  );
}
