/**
 * Small TTL cache with in-flight request de-duplication.
 *
 * Two things matter here:
 *  1. Socrata aggregations on this dataset cost 0.3s-4s each. Without caching the
 *     dashboard would issue ~8 expensive scans per page load.
 *  2. Without an app token Socrata throttles by IP, so concurrent identical
 *     queries must collapse into one upstream request.
 */
export class TtlCache {
  /** @param {{ maxEntries?: number }} [options] */
  constructor({ maxEntries = 300 } = {}) {
    this.maxEntries = maxEntries;
    /** @type {Map<string, { value: unknown, expires: number }>} */
    this.store = new Map();
    /** @type {Map<string, Promise<unknown>>} */
    this.inflight = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh LRU recency.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  }

  /**
   * Return the cached value, or run `producer` once and cache it.
   * Concurrent callers for the same key share a single promise.
   * @template T
   * @param {string} key
   * @param {number} ttlMs
   * @param {() => Promise<T>} producer
   * @returns {Promise<{ value: T, cached: boolean }>}
   */
  async getOrSet(key, ttlMs, producer) {
    const cached = this.get(key);
    if (cached !== undefined) {
      this.hits += 1;
      return { value: cached, cached: true };
    }

    const pending = this.inflight.get(key);
    if (pending) {
      this.hits += 1;
      return { value: await pending, cached: true };
    }

    this.misses += 1;
    const promise = (async () => producer())();
    this.inflight.set(key, promise);
    try {
      const value = await promise;
      this.set(key, value, ttlMs);
      return { value, cached: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  clear() {
    this.store.clear();
  }

  stats() {
    return { entries: this.store.size, inflight: this.inflight.size, hits: this.hits, misses: this.misses };
  }
}

/**
 * Run tasks with bounded concurrency so we never fan out 8 simultaneous
 * expensive scans at an unauthenticated Socrata endpoint.
 * @template T
 * @param {Array<() => Promise<T>>} tasks
 * @param {number} limit
 * @returns {Promise<T[]>}
 */
export async function mapLimit(tasks, limit = 3) {
  const results = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}
