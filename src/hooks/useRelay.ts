"use client";

/**
 * useRelay — central state machine for the RELAY UI.
 *
 * Owns:
 *  - All pipeline state (session, transcripts, triage, dispatch, escalation)
 *  - WS message routing (Transcript → Triage → Dispatch → Escalation)
 *  - Mic capture + chunk sending
 *  - Demo-mode toggle (uses mock data from lib/mockData.ts)
 *
 * Does NOT own:
 *  - Rendering (that's the components)
 *  - The actual WS connection (that's useWebSocket)
 *  - Audio processing (that's useMic)
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  Dispatch as RelayDispatch,
  EscalateTarget,
  Session,
  SessionStatus,
  Transcript,
  Triage,
  WsMessage,
} from "@/types/contracts";
import { useWebSocket, type WsStatus } from "./useWebSocket";
import { useMic } from "./useMic";
import {
  MOCK_DISPATCH,
  MOCK_SESSION,
  MOCK_TRIAGE,
  MOCK_TRANSCRIPTS,
} from "@/lib/mockData";

// ── State ─────────────────────────────────────────────────────────────────────

interface RelayState {
  session: Session;
  wsStatus: WsStatus;
  repromptMessage: string | null;
  isDemoMode: boolean;
}

const INITIAL_SESSION: Session = {
  sessionId: "",
  startTime: 0,
  status: "idle",
  transcripts: [],
  triage: null,
  dispatch: null,
};

// ── Actions ───────────────────────────────────────────────────────────────────

type RelayAction =
  | { type: "WS_STATUS"; status: WsStatus }
  | { type: "SESSION_START"; sessionId: string }
  | { type: "SESSION_END" }
  | { type: "INTERIM_TRANSCRIPT"; transcript: Transcript }
  | { type: "FINAL_TRANSCRIPT"; transcript: Transcript }
  | { type: "TRIAGE_UPDATE"; triage: Triage }
  | { type: "DISPATCH"; dispatch: RelayDispatch }
  | { type: "ESCALATION"; escalate: EscalateTarget; reason?: string }
  | { type: "REPROMPT"; message: string }
  | { type: "LOAD_MOCK" };

// ── Reducer ───────────────────────────────────────────────────────────────────

function relayReducer(state: RelayState, action: RelayAction): RelayState {
  switch (action.type) {
    case "WS_STATUS":
      return { ...state, wsStatus: action.status };

    case "SESSION_START":
      return {
        ...state,
        repromptMessage: null,
        session: {
          ...INITIAL_SESSION,
          sessionId: action.sessionId,
          startTime: Date.now(),
          status: "listening",
        },
      };

    case "SESSION_END":
      return {
        ...state,
        session: { ...state.session, status: "closed" },
      };

    case "INTERIM_TRANSCRIPT": {
      // Replace the last interim line if it's still interim; otherwise append
      const existing = state.session.transcripts;
      const lastIsInterim =
        existing.length > 0 && !existing[existing.length - 1].isFinal;
      const transcripts = lastIsInterim
        ? [...existing.slice(0, -1), action.transcript]
        : [...existing, action.transcript];
      return {
        ...state,
        session: { ...state.session, transcripts, status: "listening" },
      };
    }

    case "FINAL_TRANSCRIPT": {
      // Mark any trailing interim as replaced, then append final
      const existing = state.session.transcripts.filter((t) => t.isFinal);
      return {
        ...state,
        repromptMessage: null,
        session: {
          ...state.session,
          transcripts: [...existing, action.transcript],
          status: "processing",
        },
      };
    }

    case "TRIAGE_UPDATE":
      return {
        ...state,
        session: {
          ...state.session,
          triage: action.triage,
          status: action.triage.readyToRoute ? "triaged" : "processing",
        },
      };

    case "DISPATCH":
      return {
        ...state,
        session: {
          ...state.session,
          dispatch: action.dispatch,
          status: "dispatched",
        },
      };

    case "ESCALATION": {
      const status: SessionStatus =
        action.escalate ? "escalated" : state.session.status;
      return {
        ...state,
        session: {
          ...state.session,
          status,
          triage: state.session.triage
            ? { ...state.session.triage, escalate: action.escalate }
            : null,
        },
      };
    }

    case "REPROMPT":
      return { ...state, repromptMessage: action.message };

    case "LOAD_MOCK":
      return {
        ...state,
        isDemoMode: true,
        session: MOCK_SESSION,
        repromptMessage: null,
      };

    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseRelayReturn {
  session: Session;
  wsStatus: WsStatus;
  repromptMessage: string | null;
  isDemoMode: boolean;
  startCall: () => Promise<void>;
  endCall: () => void;
  /** Step through mock data for demo rehearsal */
  runMockDemo: () => void;
}

export function useRelay(): UseRelayReturn {
  const isDemoMode =
    process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  const [state, dispatch] = useReducer(relayReducer, {
    session: isDemoMode ? MOCK_SESSION : INITIAL_SESSION,
    wsStatus: "closed",
    repromptMessage: null,
    isDemoMode,
  });

  // ── Triage → Dispatch pipeline ─────────────────────────────────────────────
  // On every FINAL transcript we run the rest of the pipeline:
  //   transcript → /api/triage (Brain/Claude) → /api/dispatch (Matchmaker).
  // Both API routes adapt their backend's shape into the frontend contract, and
  // we feed the results into the reducer so the TriageCard, DispatchPanel and
  // map light up. Errors are logged but never crash the call.
  const runPipeline = useCallback(async (text: string, sessionId: string) => {
    try {
      const triageRes = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, sessionId }),
      });
      if (!triageRes.ok) {
        console.error("[RELAY] /api/triage failed:", triageRes.status);
        return;
      }
      const triage: Triage = await triageRes.json();
      dispatch({ type: "TRIAGE_UPDATE", triage });

      if (triage.escalate) {
        dispatch({ type: "ESCALATION", escalate: triage.escalate });
        return; // escalation beats routing — don't send a 911/human case to a shelter
      }

      if (!triage.readyToRoute || !triage.location || triage.needs.length === 0) {
        return; // Brain still gathering info — wait for the next utterance
      }

      const dispatchRes = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          needs: triage.needs,
          location: triage.location,
          sessionId,
        }),
      });
      if (!dispatchRes.ok) {
        console.error("[RELAY] /api/dispatch failed:", dispatchRes.status);
        return;
      }
      const dispatchResult: RelayDispatch = await dispatchRes.json();
      dispatch({ type: "DISPATCH", dispatch: dispatchResult });
    } catch (err) {
      console.error("[RELAY] pipeline error:", err);
    }
  }, []);

  // ── WS message handler ─────────────────────────────────────────────────────

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      switch (msg.type) {
        case "session_start":
          dispatch({ type: "SESSION_START", sessionId: msg.sessionId ?? "" });
          break;
        case "session_end":
          dispatch({ type: "SESSION_END" });
          break;
        case "interim_transcript":
          if (msg.transcript)
            dispatch({ type: "INTERIM_TRANSCRIPT", transcript: msg.transcript });
          break;
        case "final_transcript":
          if (msg.transcript) {
            dispatch({ type: "FINAL_TRANSCRIPT", transcript: msg.transcript });
            // Kick off the rest of the pipeline with the transcript's own
            // sessionId (the server stamps it on every WireTranscript).
            void runPipeline(msg.transcript.text, msg.transcript.sessionId);
          }
          break;
        case "triage_update":
          if (msg.triage)
            dispatch({ type: "TRIAGE_UPDATE", triage: msg.triage });
          break;
        case "dispatch":
          if (msg.dispatch)
            dispatch({ type: "DISPATCH", dispatch: msg.dispatch });
          break;
        case "escalation":
          dispatch({
            type: "ESCALATION",
            escalate: msg.escalate ?? null,
            reason: msg.escalationReason,
          });
          break;
        case "reprompt":
          dispatch({
            type: "REPROMPT",
            message: msg.repromptMessage ?? "I didn't catch that, can you repeat?",
          });
          break;
        default:
          console.warn("[RELAY] Unknown WS message type:", msg.type);
      }
    },
    [runPipeline]
  );

  // ── WS connection ──────────────────────────────────────────────────────────

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";

  const { status: wsStatus, sendAudioChunk, sendJson, connect, disconnect } =
    useWebSocket({
      url: wsUrl,
      onMessage: handleWsMessage,
      // In demo mode we don't want to auto-connect to a backend that isn't there
      autoConnect: !isDemoMode,
    });

  // Sync WS status into relay state. Also mirror it into a ref so startCall can
  // wait for the socket to actually be OPEN before sending control messages.
  const wsStatusRef = useRef<WsStatus>(wsStatus);
  wsStatusRef.current = wsStatus;
  useEffect(() => {
    dispatch({ type: "WS_STATUS", status: wsStatus });
  }, [wsStatus]);

  // ── Mic ────────────────────────────────────────────────────────────────────

  const { startMic, stopMic } = useMic({
    onChunk: sendAudioChunk,
    onError: (err) =>
      console.error("[RELAY mic error]", err),
  });

  // ── Public API ─────────────────────────────────────────────────────────────

  const startCall = useCallback(async () => {
    if (isDemoMode) return;

    // Flip the UI to "listening" instantly — don't wait on a server round-trip
    // that can be lost if the socket isn't open yet. The real sessionId from the
    // server arrives on its session_start echo (and on every transcript).
    dispatch({
      type: "SESSION_START",
      sessionId:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `web-${Date.now()}`,
    });

    connect(); // no-op if autoConnect already opened it
    await startMic(); // mic on; the server starts Deepgram on the first audio chunk

    // Send session_start once the socket is actually OPEN, retrying briefly.
    // If it's already open this fires immediately; otherwise it waits for the
    // connection without ever silently dropping the message.
    let attempts = 0;
    const sendSessionStart = () => {
      if (wsStatusRef.current === "open") {
        sendJson({ type: "session_start" });
      } else if (attempts++ < 25) {
        setTimeout(sendSessionStart, 150); // ~3.75s of grace
      }
    };
    sendSessionStart();
  }, [isDemoMode, connect, startMic, sendJson]);

  const endCall = useCallback(() => {
    if (isDemoMode) return;
    sendJson({ type: "session_end" });
    stopMic();
    disconnect();
    dispatch({ type: "SESSION_END" });
  }, [isDemoMode, sendJson, stopMic, disconnect]);

  /**
   * runMockDemo — animate through the mock pipeline stages one tick at a time.
   * Call repeatedly (e.g. on a button press) to step through the demo script.
   * Useful for rehearsal without a live backend.
   */
  const runMockDemo = useCallback(() => {
    const stages: RelayAction[] = [
      { type: "SESSION_START", sessionId: "demo-session-001" },
      { type: "INTERIM_TRANSCRIPT", transcript: MOCK_TRANSCRIPTS[0] },
      { type: "FINAL_TRANSCRIPT", transcript: MOCK_TRANSCRIPTS[1] },
      {
        type: "TRIAGE_UPDATE",
        triage: {
          ...MOCK_TRIAGE,
          readyToRoute: false,
          missingFields: ["location", "numberOfPeople"],
          nextQuestion: "Aap kahan hain aur aap kitne log hain?",
        },
      },
      { type: "FINAL_TRANSCRIPT", transcript: MOCK_TRANSCRIPTS[2] },
      { type: "TRIAGE_UPDATE", triage: MOCK_TRIAGE },
      { type: "DISPATCH", dispatch: MOCK_DISPATCH },
    ];

    let idx = 0;
    const tick = () => {
      if (idx < stages.length) {
        dispatch(stages[idx++]);
        setTimeout(tick, 1400);
      }
    };
    tick();
  }, []);

  return {
    session: state.session,
    wsStatus: state.wsStatus,
    repromptMessage: state.repromptMessage,
    isDemoMode: state.isDemoMode,
    startCall,
    endCall,
    runMockDemo,
  };
}
