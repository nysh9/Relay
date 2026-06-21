// Internal transcript shape filled by deepgramClient.ts. deepgramClient and
// sessionManager type against this — leave it unchanged.
export type Transcript = {
  text: string;
  language: string;
  isFinal: boolean;
  confidence: number;
};

// Frontend-facing transcript shape. Mirrors src/types/contracts.ts `Transcript`
// (the LOCKED contract the Next.js UI consumes). The server enriches its
// internal Transcript with sessionId + timestamp before sending it on the wire.
export type WireTranscript = {
  sessionId: string;
  text: string;
  isFinal: boolean;
  confidence: number;
  timestamp: number;
  language: string; // FE types this 'hi'|'en'; runtime may be 'hi'/'en'/'multi'/'unknown'
};

export type Session = {
  sessionId: string;
  partialTriage: Record<string, unknown>;
};

// Server → client. These now match the frontend WsMessage shapes (contracts.ts)
// so transcripts flow straight into the RELAY UI. `status` is kept for the
// standalone test harness (the FE ignores unknown message types).
export type EarToClientMessage =
  | { type: 'session_start'; sessionId: string }
  | { type: 'session_end'; sessionId?: string }
  | { type: 'interim_transcript'; transcript: WireTranscript }
  | { type: 'final_transcript'; transcript: WireTranscript }
  | { type: 'reprompt'; repromptMessage: string }
  | { type: 'escalation'; escalate: 'human' | '911'; escalationReason?: string }
  | { type: 'status'; message: string };

// Client → server. Accepts BOTH the Next.js app (session_start/session_end) and
// the standalone harness (start/stop), plus the backup-clip test hook.
export type ClientToEarMessage =
  | { type: 'session_start'; sessionId?: string }
  | { type: 'session_end' }
  | { type: 'start'; sessionId?: string }
  | { type: 'stop' }
  | { type: 'useBackupClip'; clipName?: string };

export type SessionState = {
  sessionId: string;
  retryCount: number;
  escalated: boolean;
};
