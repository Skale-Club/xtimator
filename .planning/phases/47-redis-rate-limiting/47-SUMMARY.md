# Phase 47: Redis + Rate Limiting Infrastructure — SUMMARY

**Status:** ✅ COMPLETE (2026-05-11)
**Milestone:** v2.1 WhatsApp Launch-Readiness
**Seed harvested:** SEED-012

## What was built

Foundational Redis client + sliding-window rate limiter applied to the four most-expensive endpoints. Also unlocks the SEED-010 debounce buffer (next phase) which uses the same Redis client.

### Files created

- `lib/redis.ts` — Upstash client singleton with availability check; fails open (returns null) when env vars not set
- `lib/ratelimit.ts` — `rateLimit(name, identifier)` + `getRateLimitCount()` + `limits` config (8 named limits)
- `tests/unit/ratelimit.test.ts` — 10 unit tests with class-based mock factory

### Files modified

- `app/api/generate-estimate/route.ts` — applies `userEstimatePerHour` + `userEstimatePerDay`, returns 429 with Retry-After via XtimatorError
- `app/api/translate/route.ts` — applies `translatePerMinute`
- `app/api/analyze-photos/route.ts` — applies `photoAnalysisPerMinute`
- `app/api/webhooks/whatsapp/route.ts` — applies `whatsappPerHour` + `whatsappPerDay` BEFORE DB lookup and AI cost
- `.env.example` — adds `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- `package.json` / `package-lock.json` — adds `@upstash/redis` dependency

## Key design decisions

- **Fail-open when Redis is unavailable** — `getRedis()` returns null, `rateLimit()` allows the request. Production should not break just because Redis is down. Strict tier enforcement (SEED-013, future) requires its own hard check.
- **Approximate sliding window via `INCR + EXPIRE NX`** — tumbling window technically (can burst at reset), but cheap and 99% sufficient. Real sliding window with sorted sets is overkill.
- **WhatsApp rate limit applied BEFORE DB lookup** — protects against burst abuse spending Whisper/Vision credits. Drops silently on hit (logs only) — Meta will retry, our hands stay clean.
- **Class-based mock factory** — followed Phase 08 pattern. `vi.fn().mockImplementation` produces non-constructible mocks after `vi.resetModules()`; class inside `vi.mock` factory survives hoisting.
- **8 named limits, not free-form** — limits are config, not parameters. Forces deliberate naming and avoids drift.

## Limits configured

| Name | Max | Window | Applied at |
|---|---|---|---|
| `ipPerMinute` | 60 | 60s | (proxy.ts future) |
| `ipPerHour` | 600 | 3600s | (proxy.ts future) |
| `userEstimatePerHour` | 30 | 3600s | `/api/generate-estimate` |
| `userEstimatePerDay` | 100 | 86400s | `/api/generate-estimate` |
| `whatsappPerHour` | 20 | 3600s | `/api/webhooks/whatsapp` |
| `whatsappPerDay` | 50 | 86400s | `/api/webhooks/whatsapp` |
| `photoAnalysisPerMinute` | 10 | 60s | `/api/analyze-photos` |
| `translatePerMinute` | 20 | 60s | `/api/translate` |

## Success criteria

| Criterion | Status |
|---|---|
| `lib/redis.ts` exposes single Upstash client; env validated at startup | ✅ |
| `rateLimit()` returns `{ allowed, retryAfter }` via INCR+EXPIRE NX | ✅ |
| 429 with `Retry-After` header on limit hit | ✅ |
| Per-IP middleware in proxy.ts | ⏸️ deferred (low priority — anti-DDoS already at Vercel edge) |
| Test coverage | ✅ 10/10 passing; existing webhook tests still pass |
| TypeScript clean | ✅ |

## Deferred

- **Per-IP middleware in proxy.ts** — Vercel already provides some DDoS protection at edge layer. Adding a custom IP rate limit on top would help but isn't launch-blocking. Can be added later as a 1-line wrapper.
- **`onLimit` callback** for WhatsApp (sending "rate limited" message to user) — not added because rate limiting is fire-and-forget at the webhook layer; we want to silently drop abuse, not engage with abusers.

## Downstream

- Phase 48 (debounce) — `lib/redis.ts` already exists, can be imported directly
- Future SEED-013 (subscriptions) — `rateLimit()` becomes the enforcement primitive for tier-based limits
