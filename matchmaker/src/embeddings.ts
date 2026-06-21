// ─── Local semantic embeddings ───────────────────────────────────────────────
// We embed both resource capabilities and caller needs with all-MiniLM-L6-v2
// running LOCALLY via transformers.js — no API key, no network call per request,
// no per-token cost. The model (~90 MB ONNX) downloads once on first use and is
// cached on disk thereafter, so a live demo runs fully offline after warm-up.
//
// 384-dim, mean-pooled, L2-normalized vectors → cosine distance in Redis.
// ─────────────────────────────────────────────────────────────────────────────

// transformers.js is an ESM package; load it lazily via dynamic import so this
// CommonJS service can consume it without a build-time ESM/CJS clash.
type FeatureExtractor = (
  text: string,
  opts: { pooling: 'mean'; normalize: boolean }
) => Promise<{ data: Float32Array | number[] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

export const EMBEDDING_DIM = 384;
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

/**
 * Lazily loads the feature-extraction pipeline exactly once. Subsequent calls
 * reuse the same in-memory model.
 */
async function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import('@xenova/transformers');
      // Don't keep model weights in memory longer than needed across runs.
      mod.env.allowLocalModels = false;
      const pipe = await mod.pipeline('feature-extraction', MODEL_ID);
      return pipe as FeatureExtractor;
    })();
  }
  return extractorPromise;
}

/**
 * Embed a piece of text into a 384-dim Float32Array (mean-pooled, normalized).
 * Throws if the model can't be loaded — callers (the matcher) catch this and
 * fall back to keyword matching so the demo never hard-fails.
 */
export async function embed(text: string): Promise<Float32Array> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return output.data instanceof Float32Array
    ? output.data
    : Float32Array.from(output.data);
}

/**
 * Warm the model at startup so the first real /dispatch request isn't slow.
 * Returns true if the model loaded, false if it failed (keyword fallback mode).
 */
export async function warmUp(): Promise<boolean> {
  try {
    await embed('warm up');
    return true;
  } catch (err) {
    console.error('[matchmaker] embedding model failed to load — keyword fallback only:', err);
    return false;
  }
}

/** Pack a Float32Array as a raw little-endian byte Buffer for Redis VECTOR params. */
export function toVectorBlob(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}
