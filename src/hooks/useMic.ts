"use client";

/**
 * useMic — captures browser microphone audio and streams PCM chunks
 * to a provided callback (which Person A's WS hook then sends to Deepgram).
 *
 * Format: 16 kHz mono PCM16 — matches Deepgram's preferred input.
 * If Deepgram ends up needing a different format, change SAMPLE_RATE here.
 */

import { useCallback, useRef, useState } from "react";

export type MicStatus = "idle" | "requesting" | "active" | "error";

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096; // ScriptProcessorNode chunk size

interface UseMicOptions {
  onChunk: (pcm: ArrayBuffer) => void;
  onError?: (err: Error) => void;
}

interface UseMicReturn {
  micStatus: MicStatus;
  startMic: () => Promise<void>;
  stopMic: () => void;
}

export function useMic({ onChunk, onError }: UseMicOptions): UseMicReturn {
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const startMic = useCallback(async () => {
    if (micStatus === "active") return;
    setMicStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // AudioContext must be created (or resumed) in a user-gesture handler
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);

      // ScriptProcessorNode is deprecated but still the most compatible
      // cross-browser approach for raw PCM access. AudioWorklet is the
      // modern replacement — swap in if browser support allows.
      const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0);
        // Convert Float32 → Int16 (PCM16)
        const pcm16 = float32ToPcm16(float32);
        onChunk(pcm16.buffer);
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      setMicStatus("active");
    } catch (err) {
      setMicStatus("error");
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [micStatus, onChunk, onError]);

  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;

    audioCtxRef.current?.close();
    audioCtxRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setMicStatus("idle");
  }, []);

  return { micStatus, startMic, stopMic };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}
