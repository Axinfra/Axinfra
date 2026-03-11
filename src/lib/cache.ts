/**
 * Lightweight in-memory TTL cache for expensive read-only computations.
 * Used to avoid re-running heavy dashboard/analytics queries within a short window.
 *
 * NOT a distributed cache — scoped to the current Node.js process.
 * Safe for serverless: worst case is a cache miss (cold start).
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** Max entries to prevent unbounded memory growth. */
const MAX_ENTRIES = 200;

/**
 * Get or compute a cached value.
 *
 * @param key   Cache key (should include projectId / userId for scoping)
 * @param ttlMs Time-to-live in milliseconds (default 30s)
 * @param fn    Async function that computes the value on cache miss
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = store.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return existing.data;
  }

  const data = await fn();

  // Evict oldest entries if we're at capacity
  if (store.size >= MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) store.delete(firstKey);
  }

  store.set(key, { data, expiresAt: now + ttlMs });
  return data;
}

/** Invalidate a single key. */
export function invalidate(key: string): void {
  store.delete(key);
}

/** Invalidate all keys matching a prefix (e.g., `dashboard:${projectId}`). */
export function invalidatePrefix(prefix: string): void {
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
