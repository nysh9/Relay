import { Transcript } from './types';

/**
 * Fake "Brain" — a stand-in for Person B's real Claude integration.
 *
 * Per the build doc: "stub a fake Brain that just echoes the transcript back
 * until Person B's real one is ready." This lets the Ear run and demo
 * end-to-end (mic -> WS -> Deepgram -> here) without blocking on Person B.
 *
 * Swap-out point: once Person B's real Brain module exists and exports
 * something with this same call signature, replace the import in server.ts
 * (processTranscript -> realBrain.process) and delete this file.
 */
export async function fakeBrainProcess(transcript: Transcript): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[brainStub] would send to Claude for triage:', {
    text: transcript.text,
    language: transcript.language,
    confidence: transcript.confidence,
  });
  // Real Brain returns a Triage object (§4). This stub intentionally returns
  // nothing — Person D's UI should treat "no triage yet" as a no-op, since
  // the real contract isn't being satisfied here.
}
