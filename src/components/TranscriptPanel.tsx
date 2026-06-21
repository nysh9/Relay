"use client";

/**
 * TranscriptPanel — live Hindi transcript display.
 *
 * Shows:
 *  - Final transcript lines (white text)
 *  - The current interim line (dimmer, italic, animates in)
 *  - A reprompt banner when Person A's confidence falls below threshold
 *  - Auto-scrolls to bottom on new content
 */

import { useEffect, useRef } from "react";
import clsx from "clsx";
import type { Transcript } from "@/types/contracts";

interface TranscriptPanelProps {
  transcripts: Transcript[];
  repromptMessage: string | null;
  isListening: boolean;
}

export function TranscriptPanel({
  transcripts,
  repromptMessage,
  isListening,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep latest line visible
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  const finalLines = transcripts.filter((t) => t.isFinal);
  const interimLine = transcripts.find((t) => !t.isFinal) ?? null;

  return (
    <section className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-relay-border">
        <span
          className={clsx(
            "inline-block h-2 w-2 rounded-full transition-colors",
            isListening ? "bg-green-400 animate-pulse" : "bg-gray-600"
          )}
        />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Live Transcript
        </h2>
        <span className="ml-auto text-[10px] text-gray-600 font-mono">HI</span>
      </div>

      {/* Reprompt banner */}
      {repromptMessage && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-md bg-yellow-900/40 border border-yellow-700/50 text-yellow-300 text-xs animate-slide-in">
          ⚠ {repromptMessage}
        </div>
      )}

      {/* Transcript lines */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {transcripts.length === 0 && !isListening && (
          <p className="text-gray-600 text-sm italic">
            Waiting for call…
          </p>
        )}

        {isListening && transcripts.length === 0 && (
          <p className="text-gray-500 text-sm italic">Listening…</p>
        )}

        {finalLines.map((t) => (
          <p
            key={t.timestamp}
            className="text-sm text-gray-100 leading-relaxed animate-fade-in"
          >
            {t.text}
          </p>
        ))}

        {/* Interim line — dimmer, italic, no animation (updates fast) */}
        {interimLine && (
          <p className="text-sm text-gray-400 italic leading-relaxed">
            {interimLine.text}
            <span className="ml-1 inline-block w-1.5 h-3.5 bg-gray-400 align-middle animate-pulse" />
          </p>
        )}

        <div ref={bottomRef} />
      </div>
    </section>
  );
}
