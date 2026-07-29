/**
 * Redis-backed rate limiting (approximate sliding window).
 *
 * Pattern: INCR + EXPIRE NX. The first INCR sets the TTL on first use of a window;
 * subsequent INCRs preserve the existing TTL. Counter exceeding `max` denies further
 * requests until window expires.
 *
 * Falls back to "allowed" when Redis is unavailable — never blocks production traffic
 * just because Redis is down. Callers can layer additional checks if strict enforcement
 * is required (e.g., tier-limit checks that must be hard).
 *
 * Usage:
 *   const { allowed, retryAfter } = await rateLimit('userEstimatePerHour', userId)
 *   if (!allowed) throw new XtimatorError('rate_limit', 'estimates', '...', undefined, { retryAfter })
 */
import { getRedis } from './redis'

export type LimitName =
  | 'ipPerMinute'
  | 'ipPerHour'
  | 'userEstimatePerHour'
  | 'userEstimatePerDay'
  | 'whatsappPerHour'
  | 'whatsappPerDay'
  | 'photoAnalysisPerMinute'
  | 'translatePerMinute'
  // Security Review S05 — close rate-limit gaps on AI/external-cost routes.
  | 'transcribePerMinute'
  | 'refinePerMinute'
  | 'sendPerMinute'
  // Security-hardening S2 — the public (unauthenticated, share-token-only)
  // sign endpoint had NO rate limit at all despite writing signature PII.
  | 'signPerMinute'
  // Pre-launch audit fix (B9) — /api/chat had NO rate limit at all (the turn
  // itself is credit-absorbed, so this is its only cost control).
  | 'chatPerMinute'
  // Phase 178 (AGENT-03) — per-company cap on agentic end-customer sends.
  | 'agenticSendPerCompanyPerDay'

interface LimitConfig {
  max: number
  /** Window in seconds */
  window: number
}

export const limits: Record<LimitName, LimitConfig> = {
  // Per IP (basic anti-DDoS)
  ipPerMinute: { max: 60, window: 60 },
  ipPerHour: { max: 600, window: 3600 },

  // Per authenticated user (normal use)
  userEstimatePerHour: { max: 30, window: 3600 },
  userEstimatePerDay: { max: 100, window: 86400 },

  // Per WhatsApp number
  whatsappPerHour: { max: 20, window: 3600 },
  whatsappPerDay: { max: 50, window: 86400 },

  // Expensive endpoints
  photoAnalysisPerMinute: { max: 10, window: 60 },
  translatePerMinute: { max: 20, window: 60 },

  // Security Review S05 — AI / external-cost endpoints that previously had no limit.
  transcribePerMinute: { max: 10, window: 60 }, // Whisper dispatch
  refinePerMinute: { max: 10, window: 60 },     // Whisper + Vision + Claude in one call
  sendPerMinute: { max: 10, window: 60 },       // Resend email / Twilio SMS fan-out

  // Security-hardening S2 — public estimate signing (no auth, only a
  // guessable-ish share token gates it; writes a signature + PII row).
  signPerMinute: { max: 10, window: 60 },

  // Default only — the chat route passes billing_config.absorbedChatRateLimitPerMin
  // as a runtime-tunable override (see the `maxOverride` param below).
  chatPerMinute: { max: 20, window: 60 },

  // Phase 178 (AGENT-03) — per-company (not per-user/session) cap on agentic
  // end-customer sends, across both the WhatsApp assistant and MCP tool.
  // Identifier passed to rateLimit() is companyId, never a user/session id.
  agenticSendPerCompanyPerDay: { max: 10, window: 86400 },
}

export interface RateLimitResult {
  allowed: boolean
  /** Current count after increment (1-based) */
  count: number
  /** Configured maximum */
  max: number
  /** Seconds until window resets — only present when blocked */
  retryAfter?: number
}

/**
 * Check and increment a rate-limit counter.
 *
 * - Atomically increments the counter and sets TTL on first use.
 * - Returns { allowed: false, retryAfter } when count exceeds max.
 * - Returns { allowed: true } when Redis is unavailable (fail-open).
 *
 * @param name - One of the configured limit names
 * @param identifier - The thing being limited (IP, userId, phone, etc.)
 * @param maxOverride - Optional runtime-tunable max (e.g. from billing_config)
 *   that replaces the static config's `max` for this call, without a deploy.
 *   The window stays fixed (static config only).
 */
export async function rateLimit(
  name: LimitName,
  identifier: string,
  maxOverride?: number
): Promise<RateLimitResult> {
  const config = limits[name]
  const max = maxOverride ?? config.max
  const redis = getRedis()

  // Fail-open: if Redis is not configured, allow the request.
  // Strict callers (tier enforcement) should not rely on this — they need a
  // separate hard check anyway.
  if (!redis) {
    return { allowed: true, count: 0, max }
  }

  const key = `rate:${name}:${identifier}`

  try {
    // INCR returns new count. EXPIRE with NX only sets if no TTL is set yet
    // (preserves the window start time across concurrent requests).
    const pipeline = redis.multi()
    pipeline.incr(key)
    pipeline.expire(key, config.window, 'NX')
    const results = await pipeline.exec<[number, 0 | 1]>()
    const count = results[0]

    if (count > max) {
      // Read TTL to compute retryAfter (best effort — race-safe enough for headers)
      const ttl = await redis.ttl(key)
      return {
        allowed: false,
        count,
        max,
        retryAfter: ttl > 0 ? ttl : config.window,
      }
    }

    return { allowed: true, count, max }
  } catch (err) {
    // Redis errored — fail open with a warning. Don't break production over a
    // Redis hiccup.
    console.warn('[ratelimit] Redis error, failing open', err)
    return { allowed: true, count: 0, max }
  }
}

/**
 * Read the current count without incrementing — useful for "what's left" displays.
 * Returns 0 when Redis is unavailable.
 */
export async function getRateLimitCount(
  name: LimitName,
  identifier: string
): Promise<number> {
  const redis = getRedis()
  if (!redis) return 0

  try {
    const key = `rate:${name}:${identifier}`
    const count = await redis.get<number>(key)
    return count ?? 0
  } catch (err) {
    console.warn('[ratelimit] Redis error reading count', err)
    return 0
  }
}
