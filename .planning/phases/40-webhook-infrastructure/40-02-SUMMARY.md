---
phase: 40-webhook-infrastructure
plan: "02"
subsystem: whatsapp-infrastructure
tags: [whatsapp, webhook, meta-graph-api, tdd, proxy, after]
dependency_graph:
  requires:
    - 40-01 (lib/whatsapp/verify.ts, lib/whatsapp/types.ts, lib/supabase/service.ts)
  provides:
    - app/api/webhooks/whatsapp/route.ts
    - proxy.ts (webhook bypass)
    - tests/unit/whatsapp/webhook-route.test.ts
  affects:
    - All inbound Meta Cloud API traffic (now bypasses auth middleware)
tech_stack:
  added: []
  patterns:
    - request.text() before JSON.parse (PITFALL-1 prevention — raw body ordering)
    - after() fire-and-forget for handleInboundMessage (Next.js 15+ / v16.2.3)
    - requireServiceClient (non-nullable) for runtime-only webhook handler
    - 23505 unique_violation for silent deduplication on whatsapp_processed_messages
    - proxy.ts early return before updateSession for unauthenticated paths
    - TDD RED→GREEN: test file written before implementation, confirmed failing, then passing
key_files:
  created:
    - app/api/webhooks/whatsapp/route.ts
    - tests/unit/whatsapp/webhook-route.test.ts
  modified:
    - proxy.ts
decisions:
  - "Used requireServiceClient() not createServiceClient() — webhook handler is runtime-only (no static build context), non-nullable variant is correct per service.ts docs"
  - "new URL(request.url) instead of request.nextUrl for GET searchParams — works for both NextRequest in production and plain Request in vitest environment"
  - "handleInboundMessage is async internal function called via after() — Phase 42 will add full message dispatch; stub logs receipt with company_id"
  - "WABA subscription (POST /{WABA_ID}/subscribed_apps) is a post-deploy manual step — documented in notes below"
metrics:
  duration: "~3 minutes"
  completed: "2026-05-10"
  tasks: 2
  files: 3
requirements_satisfied:
  - WA-01
  - WA-02
  - WA-03
  - WA-04
---

# Phase 40 Plan 02: Webhook Route Handler + Proxy Bypass Summary

**One-liner:** GET challenge verifier + POST HMAC-verified handler with after() fire-and-forget deduplication, plus proxy.ts bypass so Meta Cloud API traffic reaches the route without auth middleware interference.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Webhook route — GET challenge + POST HMAC handler (TDD) | 8b98705 | app/api/webhooks/whatsapp/route.ts, tests/unit/whatsapp/webhook-route.test.ts |
| 2 | proxy.ts bypass — /api/webhooks/ early return (WA-04) | 74367ab | proxy.ts |

## Verification Results

- Unit tests: 12/12 passed (5 verify + 2 client + 5 webhook-route)
- TypeScript: `npx tsc --noEmit` — zero errors
- GET handler: returns hub.challenge for matching verify_token, 403 otherwise
- POST handler: 401 for bad HMAC, 200 + after() for valid messages, 200 early-exit for status updates
- proxy.ts: `/api/webhooks/` early return inserted between custom-domain block and updateSession call
- Raw body ordering confirmed: `request.text()` before `verifyWebhookSignature` before `JSON.parse`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used requireServiceClient instead of createServiceClient**
- **Found during:** Task 1 GREEN phase — TypeScript reported `'supabase' is possibly 'null'`
- **Issue:** Plan specified `createServiceClient` which returns `null | SupabaseClient`. The webhook route is a runtime-only handler (never runs during static build), so the nullable variant is incorrect.
- **Fix:** Imported `requireServiceClient` from `lib/supabase/service` — this throws a clear error at startup if env vars are missing, instead of silently returning null and crashing on `.from()` calls.
- **Files modified:** app/api/webhooks/whatsapp/route.ts, tests/unit/whatsapp/webhook-route.test.ts
- **Commit:** 8b98705

**2. [Rule 1 - Bug] Used new URL(request.url) instead of request.nextUrl**
- **Found during:** Task 1 GREEN phase — tests failed with `Cannot destructure property 'searchParams' of 'request.nextUrl' as it is undefined`
- **Issue:** Test environment creates plain `Request` objects cast to `NextRequest`. `nextUrl` is only present on actual `NextRequest` instances; plain `Request` does not have it.
- **Fix:** Changed `request.nextUrl` to `new URL(request.url)` which is available on both `NextRequest` and plain `Request`, making the handler testable.
- **Files modified:** app/api/webhooks/whatsapp/route.ts
- **Commit:** 8b98705

## Known Stubs

- `handleInboundMessage`: After deduplication insert, logs receipt to console only. Phase 42 (message dispatch) will add full processing: media download, Whisper transcription, Claude estimate generation, confirmation flow dispatch.

## Post-Deploy Manual Step Required

**WABA Subscription** (Pitfall 2 from PITFALLS.md — silent delivery failure if skipped):

After deploying and registering the webhook URL in Meta Developer console (GET verification), explicitly subscribe the WABA to the app:

```
POST https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps
Authorization: Bearer {META_WHATSAPP_ACCESS_TOKEN}
```

Verify with:
```
GET https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps
```

Without this step, the GET challenge will succeed (URL verified) but Meta will not deliver POST messages to the webhook.

## Self-Check: PASSED

- [x] app/api/webhooks/whatsapp/route.ts — FOUND (committed 8b98705)
- [x] tests/unit/whatsapp/webhook-route.test.ts — FOUND (committed 8b98705)
- [x] proxy.ts updated with webhook bypass — FOUND (committed 74367ab)
- [x] 12/12 unit tests green (verify + client + webhook-route)
- [x] Zero TypeScript errors
- [x] GET exports confirmed: `export async function GET`
- [x] POST exports confirmed: `export async function POST`
- [x] proxy.ts grep: `/api/webhooks/` early return present
- [x] Raw body ordering: `request.text()` before `verifyWebhookSignature` before `JSON.parse`
