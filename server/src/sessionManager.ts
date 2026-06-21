import { SessionState, Transcript } from './types';

const CONFIDENCE_THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD ?? 0.6);
const MAX_RETRIES = Number(process.env.MAX_RETRIES ?? 2);

export type TranscriptDecision =
  | { action: 'forward' } // confident enough — hand off to the Brain
  | { action: 'reprompt'; attempt: number } // ask the caller to repeat
  | { action: 'escalate'; reason: 'human' }; // N retries exhausted — stop retrying

/**
 * Tracks per-session retry/escalation state. One instance per running server;
 * keyed by sessionId so concurrent callers don't bleed into each other's state.
 *
 * This is the implementation of the §5.5 / §13 rule:
 *   "Inaudible / low-confidence → re-prompt, don't guess... After N failed
 *    attempts (N=2) → escalate:'human'. Never guess at garbled audio — a
 *    confident wrong triage in a crisis tool is the worst outcome."
 */
export class SessionManager {
  private sessions = new Map<string, SessionState>();

  private getOrCreate(sessionId: string): SessionState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { sessionId, retryCount: 0, escalated: false };
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  /**
   * Call this on every FINAL transcript (isFinal === true) from Deepgram.
   * Interim transcripts should bypass this entirely and just be streamed to
   * the client for the live "typing" effect — they never affect retry state.
   */
  decide(sessionId: string, transcript: Transcript): TranscriptDecision {
    const state = this.getOrCreate(sessionId);

    if (state.escalated) {
      // Already handed off to a human for this session — stop retrying audio.
      return { action: 'escalate', reason: 'human' };
    }

    if (transcript.confidence < CONFIDENCE_THRESHOLD) {
      state.retryCount += 1;

      if (state.retryCount >= MAX_RETRIES) {
        // Deliberate, commented guardrail (per §2/§12): bias toward escalating
        // rather than ever sending a low-confidence transcript to the Brain.
        state.escalated = true;
        return { action: 'escalate', reason: 'human' };
      }

      return { action: 'reprompt', attempt: state.retryCount };
    }

    // Confident final transcript — reset retry count and forward downstream.
    state.retryCount = 0;
    return { action: 'forward' };
  }

  /** Called when a WS connection closes — drop session state (privacy guardrail, §2). */
  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Test/debug helper — not used in the live path. */
  getState(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }
}
