/**
 * /api/speak — text-to-speech for RELAY's spoken-back questions.
 *
 * Calls Deepgram Aura TTS for languages it supports (English, Spanish) and
 * streams back MP3 audio. For unsupported languages (e.g. Hindi) it returns 415
 * so the client falls back to the browser's SpeechSynthesis voice.
 *
 * POST body: { text: string, language: string }  // language = BCP-47 code
 * Response:  audio/mpeg  (or 415 { unsupported: true })
 */

import { NextRequest, NextResponse } from "next/server";

// DEEPGRAM_API_KEY is server-only (also used by the Ear server). Add it to the
// root .env.local for this route.
const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;

// Deepgram Aura voices, keyed by language base code. Anything not here → fall
// back to the browser voice on the client.
const VOICE_BY_LANG: Record<string, string> = {
  en: "aura-2-thalia-en",
  es: "aura-2-celeste-es",
};

export async function POST(req: NextRequest) {
  try {
    const { text, language } = (await req.json()) as {
      text?: string;
      language?: string;
    };

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const base = (language ?? "en").toLowerCase().split("-")[0];
    const model = VOICE_BY_LANG[base];

    // Unsupported language or no key → tell the client to use its own TTS.
    if (!model || !DEEPGRAM_KEY) {
      return NextResponse.json(
        { unsupported: true, reason: !model ? "language" : "no_key" },
        { status: 415 }
      );
    }

    const upstream = await fetch(
      `https://api.deepgram.com/v1/speak?model=${model}&encoding=mp3`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      }
    );

    if (!upstream.ok || !upstream.body) {
      // Let the client fall back rather than failing the call.
      const detail = await upstream.text().catch(() => "");
      console.error("[/api/speak] Deepgram error", upstream.status, detail);
      return NextResponse.json({ unsupported: true, reason: "tts_error" }, { status: 415 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/speak]", err);
    return NextResponse.json({ unsupported: true, reason: "exception" }, { status: 415 });
  }
}
