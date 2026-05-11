---
id: SEED-012
status: dormant
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (post-milestone analysis)
trigger_when: When introducing usage tiers, monetization, abuse prevention, or whenever the first paid plan is introduced
scope: Small
---

# SEED-012: Redis-Backed Rate Limiting Infrastructure

## Why This Matters

Today, Xtimator has **no rate limiting anywhere** — not in the web app, not in the WhatsApp webhook, not in the AI endpoints. This is tolerable while the user base is small and trusted, but it's a serious problem for:

1. **Public launch** — a malicious user (or a buggy client) can generate hundreds of estimates in seconds, burning through Anthropic/OpenAI credits.
2. **Paid plans** (see SEED-013) — without rate limiting, "max 10 estimates/month on the free plan" is declarative, not enforcement.
3. **WhatsApp abuse** — a bad actor can spam the webhook with messages, racking up Whisper/Vision costs with nothing blocking it.
4. **Compliance** — endpoints without rate limit are a red flag in security audits.

## The Solution: Chatbot Pattern

The legacy `C:\Users\Vanildo\Dev\chatbot` project has a lean implementation in `/lib/ratelimit.ts`:

```typescript
const MAX = 10
const TTL_SECONDS = 60 * 60

const key = `ip-rate-limit:${ip}`
const [count] = await redis.multi()
  .incr(key)
  .expire(key, TTL_SECONDS, "NX")
  .exec()

if (count > MAX) throw new RateLimitError()
```

**Approximate sliding window pattern** — simple, performant, sufficient for 99% of cases. The `EXPIRE NX` ensures the TTL is only set on first call, preserving the window even under concurrent requests.

## Rate Limiting Layers

```typescript
// lib/ratelimit.ts
export const limits = {
  // Per IP (basic anti-DDoS)
  ipPerMinute:        { max: 60,   window: 60 },
  ipPerHour:          { max: 600,  window: 3600 },

  // Per authenticated user (normal use)
  userEstimatePerHour:  { max: 30,  window: 3600 },
  userEstimatePerDay:   { max: 100, window: 86400 },

  // Per WhatsApp number
  whatsappPerHour:    { max: 20,   window: 3600 },
  whatsappPerDay:     { max: 50,   window: 86400 },

  // Expensive endpoints
  photoAnalysisPerMinute: { max: 10, window: 60 },
  translatePerMinute:     { max: 20, window: 60 },
}
```

The concrete limits come from SEED-013 (per-plan entitlements). This seed only builds the **mechanism**.

## Public API

```typescript
// Typical usage in any route handler
import { rateLimit } from '@/lib/ratelimit'

export async function POST(req: Request) {
  const { allowed, retryAfter } = await rateLimit('userEstimatePerHour', userId)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }
  // ... rest of handler
}
```

WhatsApp helper:
```typescript
await rateLimit('whatsappPerHour', phoneNumber, {
  onLimit: () => sendWhatsAppMessage(phoneNumber, '⏸️ Hold on — you reached your hourly limit. Try again in 1h.')
})
```

## Structure

```
lib/
├── redis.ts              ← shared Upstash client
└── ratelimit.ts          ← rateLimit() API + limits config
```

`redis.ts` is the same client used by SEED-010 (debounce buffer) — a single Upstash instance serves both uses with namespaced keys (`rate:`, `buffer:`).

## Scope Estimate

**Small** — 1 phase, ~1-2 days:

1. Setup Upstash (if SEED-010 hasn't already): environment variables, `lib/redis.ts` client
2. `lib/ratelimit.ts` with `rateLimit(limitName, identifier)` function
3. Apply to critical endpoints:
   - `app/api/webhooks/whatsapp/route.ts` — `whatsappPerHour`
   - `app/api/generate-estimate/route.ts` — `userEstimatePerHour`
   - `app/api/analyze-photos/route.ts` — `photoAnalysisPerMinute`
   - `app/api/translate/route.ts` — `translatePerMinute` (already has TODO comment there)
4. Global middleware for `ipPerMinute` in `proxy.ts`
5. Tests: simulate requests in a loop, verify 429 after N
6. Observability: log who is hitting limits (signal of abuse or bug)

## Breadcrumbs

- `app/api/translate/route.ts:8` — comment "rate-limit protection only" indicates intent but no implementation
- `app/api/generate-estimate/route.ts` — most expensive endpoint (Claude + processing); biggest beneficiary
- `app/api/analyze-photos/route.ts` — Vision API is expensive; needs protection
- `app/api/webhooks/whatsapp/route.ts:91-98` — dedup already has a similar pattern (insert + unique violation); rate limit is the next defense layer
- `proxy.ts` — global middleware; good place for per-IP rate limit before any route
- Reference impl: `C:\Users\Vanildo\Dev\chatbot\lib\ratelimit.ts`

## Notes

- **Why Redis and not Postgres?** Postgres can handle it, but: ~10x higher latency, contention on concurrent writes, and pollution of the app's hot query path. Redis is the right tool for ephemeral counters.
- **Why Upstash?** Serverless-first, integrates directly with Vercel, generous free tier (10k requests/day), predictable pricing. Already the chosen provider in SEED-010.
- **Distributed lock vs counter**: for rate limit, a counter is sufficient. Lock would be over-engineering.
- **Approximate sliding window vs precise**: the `INCR + EXPIRE NX` pattern creates a "tumbling window" — can allow a burst at reset time. For precision, use sliding window with sorted sets (more expensive). 99% of cases tolerate the imprecision.
- **429 with Retry-After**: standard HTTP header — well-behaved clients (including browsers and curl) respect it automatically.
- This seed is a **prerequisite** for SEED-013 (entitlements). There's no way to enforce plans without rate limiting working first.
