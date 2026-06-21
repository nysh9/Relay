export type Transcript = {
  text: string;
  language: string;
  isFinal: boolean;
  confidence: number;
};

export type Session = {
  sessionId: string;
  partialTriage: Record<string, unknown>;
};

export type EarToClientMessage =
  | { type: 'transcript'; payload: Transcript }
  | { type: 'reprompt'; message: string }
  | { type: 'escalate'; reason: 'human' | '911'; sessionId: string }
  | { type: 'status'; message: string };

export type ClientToEarMessage =
  | { type: 'start'; sessionId: string }
  | { type: 'stop' }
  | { type: 'useBackupClip'; clipName?: string };

export type SessionState = {
  sessionId: string;
  retryCount: number;
  escalated: boolean;
};
