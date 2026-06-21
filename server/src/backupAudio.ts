import 'dotenv/config';
import { createReadStream, existsSync } from 'fs';
import { resolve, join } from 'path';
import type { LiveClient } from '@deepgram/sdk';
import { bufferToArrayBuffer } from './util';

/**
 * Live-demo insurance (§11): if the live mic wobbles in the room, feed a
 * clean pre-recorded Hindi clip into the EXACT SAME Deepgram connection the
 * mic would otherwise be streaming into. From Deepgram's perspective this is
 * indistinguishable from live audio, so the rest of the pipeline (Brain,
 * Matchmaker, Map) doesn't need to know the difference.
 *
 * Expected file format: raw 16-bit PCM, mono, 16kHz — the same format the
 * browser client sends (see public/client.js). If your backup clip is a
 * .wav file with a header, strip the 44-byte RIFF header first or re-encode
 * with ffmpeg, e.g.:
 *   ffmpeg -i clip.wav -f s16le -ar 16000 -ac 1 clip.pcm
 */
export async function streamBackupClip(
  connection: LiveClient,
  clipName?: string
): Promise<void> {
  const audioDir = resolve(__dirname, '..', 'audio');
  const path = clipName
    ? join(audioDir, clipName)
    : resolve(process.env.BACKUP_AUDIO_PATH ?? join(audioDir, 'backup-hindi-sample.pcm'));

  if (!existsSync(path)) {
    throw new Error(
      `Backup clip not found at ${path}. Add a raw PCM16/16kHz/mono Hindi clip there ` +
        `(see audio/README.md), or set BACKUP_AUDIO_PATH in .env.`
    );
  }

  const CHUNK_MS = 100;
  const BYTES_PER_SAMPLE = 2; // 16-bit
  const SAMPLE_RATE = 16000;
  const chunkBytes = (SAMPLE_RATE * BYTES_PER_SAMPLE * CHUNK_MS) / 1000;

  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path, { highWaterMark: chunkBytes });

    // Pace the file at roughly real-time playback speed so Deepgram's
    // endpointing/VAD behaves the same as it would for a live mic.
    stream.on('data', (chunk) => {
      stream.pause();
      connection.send(bufferToArrayBuffer(chunk as Buffer));
      setTimeout(() => stream.resume(), CHUNK_MS);
    });

    stream.on('end', () => resolvePromise());
    stream.on('error', (err) => reject(err));
  });
}

// Allows `npm run backup-clip` for a standalone sanity check against a real
// Deepgram connection, without needing the browser or the WS server running.
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { openDeepgramConnection } = require('./deepgramClient');

  const conn = openDeepgramConnection({
    onTranscript: (t: { text: string; isFinal: boolean; confidence: number }) => {
      // eslint-disable-next-line no-console
      console.log(t.isFinal ? '[FINAL]' : '[interim]', t.confidence.toFixed(2), t.text);
    },
    onError: (err: unknown) => console.error('[backup-clip] deepgram error', err),
    onClose: () => console.log('[backup-clip] deepgram connection closed'),
  });

  conn.on('open' as any, () => {
    streamBackupClip(conn)
      .then(() => setTimeout(() => conn.requestClose(), 2000))
      .catch((err) => {
        console.error('[backup-clip] failed:', err.message);
        process.exit(1);
      });
  });
}
