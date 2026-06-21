import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk';
import { Transcript } from './types';

const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL ?? 'nova-3';

export type DeepgramCallbacks = {
  onTranscript: (transcript: Transcript) => void;
  onUtteranceEnd?: () => void;
  onError: (err: unknown) => void;
  onClose: () => void;
};

export function openDeepgramConnection(callbacks: DeepgramCallbacks): LiveClient {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      'DEEPGRAM_API_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }

  const deepgram = createClient(apiKey);

  const connection = deepgram.listen.live({
    language: 'multi',
    model: DEEPGRAM_MODEL,
    smart_format: true,
    interim_results: true,
    utterance_end_ms: 1000,
    vad_events: true,
    endpointing: 100,
    encoding: 'linear16',
    sample_rate: 16000,
    channels: 1,
  });

  connection.on(LiveTranscriptionEvents.Open, () => {
    console.log('[deepgram] connection open (language=multi, auto-detect)');
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
    const alt = data?.channel?.alternatives?.[0];
    if (!alt || typeof alt.transcript !== 'string') return;
    if (alt.transcript.trim().length === 0) return;

    const detectedLanguage: string =
      Array.isArray(alt.languages) && alt.languages.length > 0
        ? alt.languages[0]
        : 'unknown';

    const transcript: Transcript = {
      text: alt.transcript,
      language: detectedLanguage,
      isFinal: Boolean(data.is_final || data.speech_final),
      confidence: typeof alt.confidence === 'number' ? alt.confidence : 0,
    };

    callbacks.onTranscript(transcript);
  });

  connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
    callbacks.onUtteranceEnd?.();
  });

  connection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
    callbacks.onError(err);
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    callbacks.onClose();
  });

  return connection;
}
