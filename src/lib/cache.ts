/**
 * Distributed cache for expensive read-only computations.
 *
 * Primary store: Upstash Redis (REST API) — shared across all Vercel serverless
 * invocations, survives cold starts.
 * Fallback store: in-process Map — used when Upstash env vars are absent
 * (e.g. local dev without Redis). Fallback is NOT distributed; cold starts wipe it.
 *
 * Cache misses or transport errors never throw — the underlying `fn()` is always
 * invoked so callers get a correct result even if the cache layer is down.
 *
 * Date serialization: cached values are round-tripped through JSON. On read we
 * run a reviver that rehydrates ISO-8601 date strings back into `Date` objects,
 * so code that does `.getTime()` / `differenceInDays(x)` on cached fields
 * continues to work identically to the in-memory implementation.
 */

import { Redis } from '@upstash/redis';

// ── Upstash client (lazy-initialized) ───────────────────────────────────────

let redisClient: Redis | null = null;
let redisInitAttempted = false;

function getRedis(): Redis | null {
  if (redisInitAttempted) return redisClient;
  redisInitAttempted = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // Local dev / missing config — fall back to in-memory Map.
    return null;
  }

  try {
    redisClient = new Redis({ url, token });
  } catch (err) {
    console.error('[cache] Failed to initialize Upstash client, falling back to in-memory:', err);
    redisClient = null;
  }
  return redisClient;
}

// ── In-memory fallback (dev / no-Redis) ─────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const memoryStore = new Map<string, CacheEntry<unknown>>();
const MEMORY_MAX_ENTRIES = 200;

// ── JSON reviver: rehydrate ISO-8601 date strings → Date ────────────────────

// Strict ISO with T + time + zone (Z or ±HH:MM). Narrow enough to avoid
// rehydrating user-entered strings like plain "2026-04-20" as Dates.
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return value;
}

function deserialize<T>(raw: string): T {
  return JSON.parse(raw, dateReviver) as T;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Get or compute a cached value.
 *
 * @param key   Cache key (should include projectId / userId for scoping)
 * @param ttlMs Time-to-live in milliseconds
 * @param fn    Async function that computes the value on cache miss
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();

  if (redis) {
    try {
      // Upstash auto-parses JSON; request the raw string via generic typing so
      // we can run our Date reviver. The SDK returns `null` on miss.
      const raw = await redis.get<string>(key);
      if (typeof raw === 'string') {
        return deserialize<T>(raw);
      }
      // Some Upstash SDK versions auto-parse JSON and return the object directly.
      // Guard against that: if we got a non-string, non-null value, accept it
      // but note that Dates won't be rehydrated in that path.
      if (raw !== null && raw !== undefined) {
        return raw as T;
      }
    } catch (err) {
      console.error(`[cache] Redis GET failed for ${key}, computing fresh:`, err);
      // fall through to compute
    }

    const data = await fn();
    try {
      const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
      await redis.set(key, JSON.stringify(data), { ex: ttlSeconds });
    } catch (err) {
      console.error(`[cache] Redis SET failed for ${key}:`, err);
    }
    return data;
  }

  // ── In-memory fallback ──
  const now = Date.now();
  const existing = memoryStore.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return existing.data;
  }
  const data = await fn();
  if (memoryStore.size >= MEMORY_MAX_ENTRIES) {
    const firstKey = memoryStore.keys().next().value;
    if (firstKey !== undefined) memoryStore.delete(firstKey);
  }
  memoryStore.set(key, { data, expiresAt: now + ttlMs });
  return data;
}

/** Invalidate a single key. */
export async function invalidate(key: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(key);
    } catch (err) {
      console.error(`[cache] Redis DEL failed for ${key}:`, err);
    }
    return;
  }
  memoryStore.delete(key);
}

/**
 * Invalidate all keys matching a prefix (e.g., `milestone:${projectId}:list:`).
 *
 * Uses Upstash SCAN for distributed invalidation. SCAN is cursor-based and safe
 * on large keyspaces but has per-request cost — prefer calling this only on
 * write paths (create / update / delete), not read paths.
 */
export async function invalidatePrefix(prefix: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const match = `${prefix}*`;
      let cursor: string | number = 0;
      const toDelete: string[] = [];
      // Cap iterations to bound worst-case latency on pathological keyspaces.
      for (let i = 0; i < 20; i++) {
        const [next, keys] = (await redis.scan(cursor, { match, count: 100 })) as [
          string | number,
          string[],
        ];
        if (keys.length > 0) toDelete.push(...keys);
        cursor = next;
        if (String(cursor) === '0') break;
      }
      if (toDelete.length > 0) {
        await redis.del(...toDelete);
      }
    } catch (err) {
      console.error(`[cache] Redis prefix invalidation failed for ${prefix}:`, err);
    }
    return;
  }
  for (const key of Array.from(memoryStore.keys())) {
    if (key.startsWith(prefix)) memoryStore.delete(key);
  }
}
