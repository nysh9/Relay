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
import type { AgentPrompt, Transcript } from "@/types/contracts";

interface TranscriptPanelProps {
  transcripts: Transcript[];
  agentPrompts?: AgentPrompt[];
  repromptMessage: string | null;
  isListening: boolean;
}

// One conversation turn — either a caller transcript or a RELAY spoken question.
type Turn =
  | { kind: "caller"; ts: number; transcript: Transcript }
  | { kind: "agent"; ts: number; prompt: AgentPrompt };

export function TranscriptPanel({
  transcripts,
  agentPrompts = [],
  repromptMessage,
  isListening,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep latest line visible
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, agentPrompts]);

  const interimLine = transcripts.find((t) => !t.isFinal) ?? null;

  // Interleave caller turns and RELAY turns by timestamp into one conversation.
  const turns: Turn[] = [
    ...transcripts
      .filter((t) => t.isFinal)
      .map((t): Turn => ({ kind: "caller", ts: t.timestamp, transcript: t })),
    ...agentPrompts.map(
      (p): Turn => ({ kind: "agent", ts: p.timestamp, prompt: p })
    ),
  ].sort((a, b) => a.ts - b.ts);

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

        {turns.map((turn) =>
          turn.kind === "caller" ? (
            <p
              key={`c-${turn.ts}`}
              className="text-sm text-gray-100 leading-relaxed animate-fade-in"
            >
              {turn.transcript.text}
            </p>
          ) : (
            <div
              key={`a-${turn.ts}`}
              className="px-3 py-2 rounded-md bg-green-900/30 border border-green-700/40 animate-slide-in"
            >
              <div className="text-[9px] font-mono uppercase tracking-widest text-green-500 mb-1">
                RELAY → Caller
              </div>
              <p className="text-sm text-green-100 leading-relaxed">
                {turn.prompt.text}
              </p>
              {turn.prompt.textEnglish && (
                <p className="mt-1 text-xs text-green-400/70 italic leading-relaxed">
                  <span className="font-mono not-italic mr-1">EN</span>
                  {turn.prompt.textEnglish}
                </p>
              )}
            </div>
          )
        )}

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
