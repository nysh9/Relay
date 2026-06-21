"use client";

/**
 * useWebSocket — Person D's interface to Person A's Node WS server.
 *
 * Responsibilities:
 *  - Open/close the WebSocket connection to NEXT_PUBLIC_WS_URL
 *  - Send raw PCM audio chunks (ArrayBuffer) from the browser mic
 *  - Receive and parse WsMessage frames
 *  - Expose a typed onMessage callback so useRelay can react to each event
 *  - Reconnect with exponential back-off on unexpected close
 *  - Surface connection status so the UI can show "LIVE / CONNECTING / OFFLINE"
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { WsMessage } from "@/types/contracts";

export type WsStatus = "connecting" | "open" | "closed" | "error";

interface UseWebSocketOptions {
  url: string;
  onMessage: (msg: WsMessage) => void;
  /** Auto-connect on mount? Default true. */
  autoConnect?: boolean;
  /** Max reconnect attempts before giving up. Default 5. */
  maxRetries?: number;
}

interface UseWebSocketReturn {
  status: WsStatus;
  connect: () => void;
  disconnect: () => void;
  sendAudioChunk: (chunk: ArrayBuffer) => void;
  sendJson: (msg: WsMessage) => void;
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

export function useWebSocket({
  url,
  onMessage,
  autoConnect = true,
  maxRetries = 5,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage; // keep stable without re-subscribing

  const [status, setStatus] = useState<WsStatus>("closed");

  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const connect = useCallback(() => {
    // Don't double-connect
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setStatus("connecting");

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer"; // we send raw PCM as ArrayBuffer

    ws.onopen = () => {
      retriesRef.current = 0;
      setStatus("open");
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data as string);
        onMessageRef.current(msg);
      } catch {
        console.warn("[RELAY WS] Could not parse message:", event.data);
      }
    };

    ws.onerror = () => {
      setStatus("error");
    };

    ws.onclose = (event) => {
      wsRef.current = null;
      const wasClean = event.wasClean;

      if (!wasClean && retriesRef.current < maxRetries) {
        setStatus("connecting");
        const delay = Math.min(
          BASE_DELAY_MS * 2 ** retriesRef.current,
          MAX_DELAY_MS
        );
        retriesRef.current += 1;
        retryTimerRef.current = setTimeout(connect, delay);
      } else {
        setStatus("closed");
      }
    };

    wsRef.current = ws;
  }, [url, maxRetries]);

  const disconnect = useCallback(() => {
    clearRetryTimer();
    retriesRef.current = maxRetries; // prevent auto-reconnect
    if (wsRef.current) {
      wsRef.current.close(1000, "user_disconnect");
      wsRef.current = null;
    }
    setStatus("closed");
  }, [maxRetries]);

  /** Send raw PCM audio chunk to Person A's Deepgram bridge */
  const sendAudioChunk = useCallback((chunk: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(chunk);
    }
  }, []);

  /** Send a typed JSON control message (session_start, session_end, etc.) */
  const sendJson = useCallback((msg: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) connect();
    return () => {
      clearRetryTimer();
      // Don't hard-close on unmount — just let it die naturally
      if (wsRef.current) wsRef.current.close(1001, "component_unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, connect, disconnect, sendAudioChunk, sendJson };
}
