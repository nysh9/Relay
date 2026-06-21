// ─── Redis vector store ──────────────────────────────────────────────────────
// This is the "Redis beyond caching" core: resources live in Redis as hashes
// with a 384-dim capability embedding, indexed by the Redis Query Engine
// (RediSearch) for KNN vector recall. The Matchmaker embeds the caller's needs
// and asks Redis for the semantically-nearest resources — then deterministic TS
// (match.ts) ranks the candidates. AI recalls; code decides (§1).
//
// Requires Redis Stack / Redis 8 (the Query Engine module). docker-compose.yml
// at the repo root brings this up locally.
// ─────────────────────────────────────────────────────────────────────────────

import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Resource } from './contracts';
import { embed, toVectorBlob, EMBEDDING_DIM, warmUp } from './embeddings';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

const INDEX_NAME = 'idx:resources';
const KEY_PREFIX = 'resource:';

/** True once embeddings are available; false → keyword-only fallback mode. */
let vectorMode = false;

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

/** The text we embed for a resource: its type + capabilities, e.g. "shelter beds water meals". */
function capabilityText(r: Resource): string {
  return `${r.type} ${r.has.join(' ')}`;
}

/** Load the Houston resource dataset from disk (kept out of src/ as pure data). */
export function loadResources(): Resource[] {
  const path = join(__dirname, '..', 'resources.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as Resource[];
}

/**
 * (Re)create the vector index. Drops any existing index first so reseeding is
 * idempotent across restarts. FLAT (exact KNN) is correct here — with ~20
 * resources there's nothing to gain from HNSW, and FLAT needs zero tuning.
 */
async function createIndex(): Promise<void> {
  try {
    await redis.call('FT.DROPINDEX', INDEX_NAME);
  } catch {
    // No existing index — fine on a cold Redis.
  }

  await redis.call(
    'FT.CREATE',
    INDEX_NAME,
    'ON',
    'HASH',
    'PREFIX',
    '1',
    KEY_PREFIX,
    'SCHEMA',
    'type',
    'TAG',
    'has',
    'TAG',
    'SEPARATOR',
    ',',
    'embedding',
    'VECTOR',
    'FLAT',
    '6',
    'TYPE',
    'FLOAT32',
    'DIM',
    String(EMBEDDING_DIM),
    'DISTANCE_METRIC',
    'COSINE'
  );
}

/**
 * Seed Redis with the resource dataset: one hash per resource holding the full
 * JSON (for easy reconstruction), `type` + `has` TAGs (for keyword fallback),
 * and the capability embedding. Called once on server boot.
 *
 * If the embedding model can't load, we still seed the hashes + TAGs so keyword
 * fallback works, and skip the vector index. The demo degrades, never dies.
 */
export async function seed(): Promise<void> {
  const resources = loadResources();
  vectorMode = await warmUp();

  if (vectorMode) {
    await createIndex();
  }

  for (const r of resources) {
    const fields: (string | Buffer)[] = [
      'json',
      JSON.stringify(r),
      'type',
      r.type,
      'has',
      r.has.join(','),
    ];
    if (vectorMode) {
      const vec = await embed(capabilityText(r));
      fields.push('embedding', toVectorBlob(vec));
    }
    await redis.call('HSET', keyFor(r.id), ...fields);
  }

  console.log(
    `[matchmaker] seeded ${resources.length} resources into Redis ` +
      `(${vectorMode ? 'vector + keyword' : 'keyword-only fallback'} mode)`
  );
}

export function isVectorMode(): boolean {
  return vectorMode;
}

// ─── Reply parsing ───────────────────────────────────────────────────────────

/**
 * FT.SEARCH (RESP2) returns: [ total, key1, [f1, v1, f2, v2, ...], key2, [...], ... ].
 * We only ever RETURN the `json` field, so pull that out and parse each hit.
 */
function parseSearchReply(reply: unknown): Resource[] {
  if (!Array.isArray(reply)) return [];
  const out: Resource[] = [];
  // reply[0] is the count; hits start at index 1 as [key, fieldsArray] pairs.
  for (let i = 1; i < reply.length; i += 2) {
    const fields = reply[i + 1];
    if (!Array.isArray(fields)) continue;
    for (let j = 0; j < fields.length; j += 2) {
      if (String(fields[j]) === 'json') {
        try {
          out.push(JSON.parse(String(fields[j + 1])) as Resource);
        } catch {
          /* skip malformed */
        }
      }
    }
  }
  return out;
}

/**
 * KNN vector recall: embed the query text, ask Redis for the `k` nearest
 * resources by cosine distance. Returns them in nearest-first order (Redis
 * sorts by the distance score).
 */
export async function knnSearch(queryText: string, k: number): Promise<Resource[]> {
  const vec = await embed(queryText);
  const blob = toVectorBlob(vec);
  const reply = await redis.call(
    'FT.SEARCH',
    INDEX_NAME,
    `*=>[KNN ${k} @embedding $BLOB AS vector_score]`,
    'PARAMS',
    '2',
    'BLOB',
    blob,
    'SORTBY',
    'vector_score',
    'RETURN',
    '1',
    'json',
    'DIALECT',
    '2',
    'LIMIT',
    '0',
    String(k)
  );
  return parseSearchReply(reply);
}

/**
 * Keyword fallback: TAG-match resources whose `has` capabilities overlap any of
 * the caller's needs. Used when the embedding model is unavailable, or as a
 * safety net if vector search throws mid-request. Pure Redis, no model needed.
 */
export async function tagSearch(needs: string[], k: number): Promise<Resource[]> {
  // Sanitize needs into TAG tokens; RediSearch TAG OR syntax is {a|b|c}.
  const tokens = needs
    .map((n) => n.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'))
    .filter(Boolean);
  if (tokens.length === 0) {
    // No usable needs — just return some open resources so the UI still routes.
    const reply = await redis.call(
      'FT.SEARCH',
      INDEX_NAME,
      '*',
      'RETURN',
      '1',
      'json',
      'LIMIT',
      '0',
      String(k)
    );
    return parseSearchReply(reply);
  }
  const query = `@has:{${tokens.join('|')}}`;
  const reply = await redis.call(
    'FT.SEARCH',
    INDEX_NAME,
    query,
    'RETURN',
    '1',
    'json',
    'LIMIT',
    '0',
    String(k)
  );
  return parseSearchReply(reply);
}

/**
 * When even the index doesn't exist (model failed, so we never created it),
 * fall all the way back to scanning the raw hashes. Guarantees a non-empty
 * candidate set for the demo regardless of Query Engine availability.
 */
export async function scanAllResources(): Promise<Resource[]> {
  const resources = loadResources();
  return resources;
}
