/**
 * Deepgram Aura-2 text-to-speech — speaks the Ear's own messages back to the
 * caller (currently just the low-confidence reprompt: "I didn't catch that,
 * can you repeat?"). This is the Ear "talking back," separate from Deepgram
 * STT (deepgramClient.ts), which only listens.
 *
 * Aura-2 language coverage is narrower than STT's `language: 'multi'` auto-detect:
 * English, Spanish, Dutch, French, German, Italian, Japanese only (no Hindi, etc.
 * as of writing). Since our reprompt text itself is hardcoded English, we pick an
 * Aura-2 voice for the caller's detected language when one exists and otherwise
 * just speak the English text with an English voice — never silently fail.
 */

const DEEPGRAM_SPEAK_URL = 'https://api.deepgram.com/v1/speak';

// One representative Aura-2 voice per supported language. Swap freely —
// these are just defaults, not a contractual choice.
const VOICE_BY_LANGUAGE: Record<string, string> = {
  en: 'aura-2-thalia-en',
  es: 'aura-2-celeste-es',
  nl: 'aura-2-rhea-nl',
  fr: 'aura-2-agathe-fr',
  de: 'aura-2-viktoria-de',
  it: 'aura-2-livia-it',
  ja: 'aura-2-izanami-ja',
};

const FALLBACK_VOICE = VOICE_BY_LANGUAGE.en;

export type TtsResult = {
  audio: Buffer; // raw WAV bytes
  mime: 'audio/wav';
  model: string;
};

/**
 * Pick the closest Aura-2 voice for a Deepgram STT language code
 * (e.g. 'es', 'es-419', 'hi', 'multi', 'unknown'). Falls back to English
 * whenever the detected language isn't one Aura-2 speaks.
 */
export function pickVoiceModel(sttLanguage: string | undefined): string {
  if (!sttLanguage) return FALLBACK_VOICE;
  const base = sttLanguage.split('-')[0].toLowerCase();
  return VOICE_BY_LANGUAGE[base] ?? FALLBACK_VOICE;
}

/**
 * Synthesize `text` with Aura-2 and return the raw audio bytes (WAV).
 * Throws on any non-2xx response or network error — callers should catch
 * this and fall back to text-only delivery rather than let it crash a session.
 */
export async function synthesizeSpeech(
  text: string,
  sttLanguage?: string
): Promise<TtsResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      'DEEPGRAM_API_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }

  const model = pickVoiceModel(sttLanguage);
  const url = `${DEEPGRAM_SPEAK_URL}?model=${encodeURIComponent(model)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable body>');
    throw new Error(`Deepgram TTS request failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return { audio: Buffer.from(arrayBuffer), mime: 'audio/wav', model };
}
