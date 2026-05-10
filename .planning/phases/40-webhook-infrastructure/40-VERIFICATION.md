---
phase: 40-webhook-infrastructure
verified: 2026-05-10T15:57:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 40: Webhook Infrastructure Verification Report

**Phase Goal:** System can receive, verify, and route inbound WhatsApp messages from Meta Cloud API — webhook endpoint is live, signature-verified, deduplicated, and bypasses auth middleware.
**Verified:** 2026-05-10T15:57:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                       | Status     | Evidence                                                                                   |
|----|-------------------------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------|
| 1  | GET /api/webhooks/whatsapp responds with hub.challenge plaintext when verify_token matches                  | VERIFIED   | GET handler line 18-19; test "returns hub.challenge when token matches" passes             |
| 2  | GET /api/webhooks/whatsapp returns 403 when token does not match                                            | VERIFIED   | GET handler line 21; test "returns 403 when token does not match" passes                   |
| 3  | POST /api/webhooks/whatsapp returns 401 immediately when HMAC signature fails                               | VERIFIED   | POST handler lines 39-41; test "returns 401 when signature verification fails" passes       |
| 4  | POST /api/webhooks/whatsapp returns 200 immediately for valid signature, defers processing via after()      | VERIFIED   | POST handler lines 52-56; test "returns 200 for valid message payload" passes              |
| 5  | POST /api/webhooks/whatsapp returns 200 immediately for status webhook payloads (early exit, no DB work)    | VERIFIED   | POST handler lines 47-48; test "returns 200 immediately for status update webhooks" passes |
| 6  | Duplicate wamid is silently discarded (23505 conflict on whatsapp_processed_messages insert)                | VERIFIED   | handleInboundMessage lines 94-97; 23505 code check present; whatsapp_processed_messages PRIMARY KEY TEXT in migration |
| 7  | proxy.ts bypasses auth middleware for /api/webhooks/ paths before calling updateSession                     | VERIFIED   | proxy.ts lines 22-27 — early return before updateSession on line 30                       |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact                                                               | Expected                                                                           | Status   | Details                                                                                                    |
|------------------------------------------------------------------------|------------------------------------------------------------------------------------|----------|------------------------------------------------------------------------------------------------------------|
| `app/api/webhooks/whatsapp/route.ts`                                   | GET challenge + POST HMAC-verified handler with after() fire-and-forget            | VERIFIED | 113 lines, exports GET and POST, uses after(), requireServiceClient, verifyWebhookSignature, WhatsAppPayload |
| `lib/whatsapp/verify.ts`                                               | verifyWebhookSignature using node:crypto HMAC-SHA256 + timingSafeEqual             | VERIFIED | 25 lines, imports createHmac + timingSafeEqual from node:crypto, catches length-mismatch exception         |
| `lib/whatsapp/client.ts`                                               | sendWhatsAppMessage + downloadWhatsAppMedia typed wrappers for Meta Graph API v21.0 | VERIFIED | 53 lines, both functions exported, uses graph.facebook.com/v21.0                                          |
| `lib/whatsapp/types.ts`                                                | WhatsAppPayload, WhatsAppMessage, WhatsAppEntry TypeScript interfaces               | VERIFIED | 52 lines, all required interfaces present and correctly typed                                              |
| `proxy.ts`                                                             | Early return for /api/webhooks/ paths (WA-04)                                      | VERIFIED | Lines 22-27: `if (pathname.startsWith('/api/webhooks/')) { return NextResponse.next() }` before updateSession |
| `supabase/migrations/20260510000002_phase40_whatsapp.sql`              | Three WhatsApp tables + RLS deny-all + pg_cron 48h purge                           | VERIFIED | 59 lines: company_whatsapp, whatsapp_sessions, whatsapp_processed_messages with ENABLE ROW LEVEL SECURITY; pg_cron DO $do$ guard |
| `tests/unit/whatsapp/verify.test.ts`                                   | Unit tests for verifyWebhookSignature (valid, tampered, missing prefix, length mismatch) | VERIFIED | 5 tests: all 5 scenarios covered, all pass                                                            |
| `tests/unit/whatsapp/webhook-route.test.ts`                            | Unit tests for GET and POST handler branches                                        | VERIFIED | 5 tests covering all branches: challenge match/mismatch, bad HMAC, status update, valid message          |

---

### Key Link Verification

| From                                       | To                                 | Via                                       | Status   | Details                                                                                   |
|--------------------------------------------|------------------------------------|-------------------------------------------|----------|-------------------------------------------------------------------------------------------|
| `app/api/webhooks/whatsapp/route.ts`       | `lib/whatsapp/verify.ts`           | `verifyWebhookSignature` import           | WIRED    | Line 3: `import { verifyWebhookSignature } from '@/lib/whatsapp/verify'`; called line 39  |
| `app/api/webhooks/whatsapp/route.ts`       | `lib/supabase/service.ts`          | `requireServiceClient` for deduplication  | WIRED    | Line 4: `import { requireServiceClient } from '@/lib/supabase/service'`; called line 72   |
| `app/api/webhooks/whatsapp/route.ts`       | `whatsapp_processed_messages` (DB) | `supabase.from('whatsapp_processed_messages').insert()` | WIRED | Lines 90-92: insert with message_id + company_id; 23505 handled lines 94-97 |
| `app/api/webhooks/whatsapp/route.ts`       | `lib/whatsapp/types.ts`            | `WhatsAppPayload` type import             | WIRED    | Line 5: `import type { WhatsAppPayload } from '@/lib/whatsapp/types'`                     |
| `proxy.ts`                                 | `/api/webhooks/*` bypass           | Early return before updateSession         | WIRED    | Line 25: `pathname.startsWith('/api/webhooks/')` returns NextResponse.next() at line 26   |

---

### Critical Ordering Verification (WA-01 Raw Body Pitfall)

The PLAN explicitly required that `request.text()` is called BEFORE `JSON.parse`. Verified in `app/api/webhooks/whatsapp/route.ts`:

- Line 35: `const rawBody = await request.text()` — raw body captured first
- Line 36: `const signature = request.headers.get('x-hub-signature-256')` — header extracted
- Line 39: `verifyWebhookSignature(rawBody, signature, ...)` — HMAC verified against raw string
- Line 44: `const payload = JSON.parse(rawBody) as WhatsAppPayload` — JSON parsed only after verification

Ordering is correct. HMAC is always computed against the original wire bytes, never re-serialized JSON.

---

### Service Client Deviation (Auto-Fixed, Not a Gap)

The PLAN specified `createServiceClient` (nullable). The implementation correctly uses `requireServiceClient` (non-nullable). This is an intentional auto-fix documented in the SUMMARY:

- `createServiceClient` returns `null | SupabaseClient` — unsafe for runtime API routes
- `requireServiceClient` throws at startup if env vars are missing — correct behavior for a webhook handler that never runs during static build

The deviation improves correctness and is a valid upgrade from the plan's specification.

---

### Data-Flow Trace (Level 4)

| Artifact                                  | Data Variable       | Source                                           | Produces Real Data | Status   |
|-------------------------------------------|---------------------|--------------------------------------------------|--------------------|----------|
| `app/api/webhooks/whatsapp/route.ts`      | `payload` (POST)    | `request.text()` + `JSON.parse()` — live inbound | Yes — live wire body | FLOWING |
| `handleInboundMessage` deduplication      | `whatsappConfig`    | `supabase.from('company_whatsapp').select()`     | Yes — DB query      | FLOWING  |
| `handleInboundMessage` dedup insert       | `dedupError`        | `supabase.from('whatsapp_processed_messages').insert()` | Yes — DB write  | FLOWING  |

Note: `handleInboundMessage` is documented as a stub for Phase 42 message dispatch (after the deduplication insert, it only logs). This is intentional scope — Phase 40's goal is infrastructure only, not full processing.

---

### Behavioral Spot-Checks

| Behavior                                             | Command                                                      | Result                           | Status |
|------------------------------------------------------|--------------------------------------------------------------|----------------------------------|--------|
| All WhatsApp unit tests pass (12 tests across 3 files) | `npx vitest run tests/unit/whatsapp/ --reporter=verbose`    | 12/12 passed, 3 test files       | PASS   |
| verifyWebhookSignature returns true for valid HMAC   | Covered by verify.test.ts test 1                            | passes                           | PASS   |
| GET returns hub.challenge for matching token         | Covered by webhook-route.test.ts test 1                     | passes                           | PASS   |
| POST returns 401 for bad HMAC                        | Covered by webhook-route.test.ts test 3                     | passes                           | PASS   |
| proxy.ts bypass present before updateSession         | `grep -n "api/webhooks" proxy.ts` — line 25 before line 30  | lines 25-27 confirmed            | PASS   |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                              | Status    | Evidence                                                                      |
|-------------|-------------|----------------------------------------------------------------------------------------------------------|-----------|-------------------------------------------------------------------------------|
| WA-01       | 40-01, 40-02 | Webhook POST verifies HMAC-SHA256 and returns 200 before processing (fire-and-forget via after())        | SATISFIED | verify.ts HMAC implementation + after() in route.ts + 12/12 tests green      |
| WA-02       | 40-01, 40-02 | Webhook GET responds to Meta hub.challenge for initial verification                                      | SATISFIED | GET handler returns challenge plaintext for matching token, 403 otherwise     |
| WA-03       | 40-01, 40-02 | Duplicate messages (same wamid.*) silently discarded                                                     | SATISFIED | whatsapp_processed_messages TEXT PRIMARY KEY + 23505 handling in route.ts     |
| WA-04       | 40-02       | Meta webhook requests bypass auth middleware in proxy.ts                                                  | SATISFIED | `pathname.startsWith('/api/webhooks/')` early return before updateSession     |

---

### Anti-Patterns Found

| File                                        | Line | Pattern                                         | Severity | Impact                                                          |
|---------------------------------------------|------|-------------------------------------------------|----------|-----------------------------------------------------------------|
| `app/api/webhooks/whatsapp/route.ts`        | 105  | `console.log(...)` — only output after dedup   | Info     | Intentional Phase 42 stub; documented; no user-visible hollow rendering |

No blocker or warning anti-patterns. The `console.log` in `handleInboundMessage` is the documented Phase 42 stub — message dispatch logic is deliberately deferred. This does not block Phase 40's goal of a verified, deduplicated, auth-bypassed channel.

---

### Human Verification Required

The following behaviors cannot be verified programmatically and require a live Meta environment:

#### 1. GET Webhook Challenge via Meta Portal

**Test:** Deploy to production/staging, register the webhook URL in Meta Developer Console, click "Verify and Save"
**Expected:** Meta sends GET with hub.mode=subscribe, hub.verify_token, hub.challenge; server responds 200 with hub.challenge; Meta confirms webhook
**Why human:** Requires live Meta Developer Portal interaction and a public URL; cannot simulate Meta's exact challenge flow in CI

#### 2. POST Message Delivery Without Auth Redirect

**Test:** After WABA subscription (POST /{WABA_ID}/subscribed_apps), send a WhatsApp message to the registered number and inspect server logs
**Expected:** POST reaches the route without a 3xx redirect; signature verification passes; server logs `[WhatsApp] Received message wamid.* from +... for company ...`
**Why human:** Requires a live Meta Cloud API connection, a real WhatsApp-registered number, and the WABA subscription activated post-deploy

#### 3. WABA Subscription Activation

**Test:** `POST https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps` with `Authorization: Bearer {META_WHATSAPP_ACCESS_TOKEN}`, then verify with GET
**Expected:** GET returns 200 with the subscription confirmed; after which, Meta will deliver inbound messages to the webhook
**Why human:** Meta portal/API operation, post-deploy step; without it, GET verification succeeds but no POSTs will arrive

---

### Gaps Summary

No gaps. All 7 observable truths are verified. All critical must-haves are present, substantive, and wired. The 12 unit tests all pass. The proxy bypass is correctly positioned before `updateSession`. Raw body ordering is correct. Deduplication is wired to the correct table with 23505 handling.

The only open items are post-deploy manual steps (WABA subscription) and live Meta environment testing — these are expected human verification items for any webhook infrastructure phase, not implementation gaps.

---

_Verified: 2026-05-10T15:57:00Z_
_Verifier: Claude (gsd-verifier)_
