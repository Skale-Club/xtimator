/**
 * Tiny in-memory stale-while-revalidate cache.
 *
 *  - fresh entry  -> returned as is;
 *  - stale entry  -> returned immediately while ONE background refresh runs, so
 *    a slow Notion never blocks a page render after the first load;
 *  - no entry     -> the caller waits for the loader (deduplicated).
 *
 * A failing background refresh keeps serving the stale value. A failing first
 * load rejects; callers decide how to degrade.
 */
export interface SwrCache<T> {
  /**
   * `fallback`, when given, is returned (and cached for `errorTtlMs`) if the
   * FIRST load fails, so a down upstream is not hammered on every request.
   */
  get(key: string, loader: () => Promise<T>, fallback?: T): Promise<T>
  clear(): void
}

export function createSwrCache<T>(opts: {
  ttlMs: number
  errorTtlMs?: number
  now?: () => number
}): SwrCache<T> {
  const now = opts.now ?? Date.now
  const entries = new Map<string, { value: T; at: number }>()
  const inflight = new Map<string, Promise<T>>()

  function load(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key)
    if (existing) return existing
    const promise = loader()
      .then((value) => {
        entries.set(key, { value, at: now() })
        return value
      })
      .finally(() => {
        inflight.delete(key)
      })
    inflight.set(key, promise)
    return promise
  }

  return {
    async get(key, loader, fallback) {
      const entry = entries.get(key)
      if (entry && now() - entry.at < opts.ttlMs) return entry.value
      if (entry) {
        // Stale: refresh in the background, keep serving the old value on failure.
        load(key, loader).catch(() => {})
        return entry.value
      }
      if (fallback === undefined) return load(key, loader)
      try {
        return await load(key, loader)
      } catch {
        // Backdate the entry so it expires after errorTtlMs instead of ttlMs.
        const errorTtl = opts.errorTtlMs ?? opts.ttlMs
        entries.set(key, { value: fallback, at: now() - (opts.ttlMs - errorTtl) })
        return fallback
      }
    },
    clear() {
      entries.clear()
      inflight.clear()
    },
  }
}
