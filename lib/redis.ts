/**
 * Upstash Redis client — shared singleton used by rate limiting and the
 * WhatsApp debounce buffer.
 *
 * Environment:
 *   UPSTASH_REDIS_REST_URL  — required at runtime
 *   UPSTASH_REDIS_REST_TOKEN — required at runtime
 *
 * If env vars are missing, callers receive null and should treat Redis-backed
 * features as no-op (e.g. rate limit becomes pass-through, debounce processes
 * immediately). Strict callers may throw their own XtimatorError.
 */
import { Redis } from '@upstash/redis'

let cachedClient: Redis | null = null
let cachedAvailable: boolean | null = null

/**
 * Returns a Redis client, or null if env vars are not set.
 * Memoized — env is read once per process.
 */
export function getRedis(): Redis | null {
  if (cachedAvailable === null) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    cachedAvailable = Boolean(url && token)
    if (cachedAvailable) {
      cachedClient = new Redis({ url: url as string, token: token as string })
    }
  }
  return cachedClient
}

/**
 * True when Redis is configured. Lets callers branch on availability without
 * actually instantiating the client.
 */
export function isRedisAvailable(): boolean {
  if (cachedAvailable === null) {
    getRedis()
  }
  return cachedAvailable === true
}

/** Reset the cache (test helper). */
export function __resetRedisCache(): void {
  cachedClient = null
  cachedAvailable = null
}
