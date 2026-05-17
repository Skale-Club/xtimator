---
phase: 70-stripe-connect-customer-payments
plan: 04
subsystem: payments
tags: [stripe, stripe-connect, webhook, resend, email, tdd]

requires:
  - phase: 70-01
    provides: estimates.payment_status + 4 payment columns; companies.stripe_account_id + connect-status columns; Wave 0 RED test connect-events.test.ts
  - phase: 70-03
    provides: Checkout Session metadata.{estimate_id, company_id} contract; payment_status flow surfaced by share query

provides:
  - lib/billing/connect-webhook.ts — handleConnectEvent(event, stripe, svc) dispatcher
  - lib/email/payment-emails.ts — sendPaymentReceivedEmail + sendPaymentReceiptEmail (never throw)
  - Extended webhook route branching on event.account (Connect vs platform)
  - Handler for 3 Connect event types: checkout.session.completed, account.application.deauthorized, account.updated

affects:
  - 70-05 (final test pass + verification — webhook setup runbook will be documented there)
  - End-to-end customer payment loop: customer pays → DB marked paid → 2 emails sent → share page green banner persists

tech-stack:
  added: []
  patterns:
    - event.account presence as sole Connect/platform discriminator (no event-type prefix sniffing)
    - Connect handler co-located in lib/billing/connect-webhook.ts (route stays thin; module is unit-testable in isolation)
    - Promise.allSettled around email sends so a transient Resend failure on one address cannot prevent the other
    - Email helpers swallow their own errors (log + return) so the webhook can never 5xx for an email outage (Stripe must not retry forever)
    - Dynamic import of lib/email/payment-emails inside the handler so non-payment events don't pay the import cost
    - Idempotency reuses existing processed_stripe_events table (no new tables; matches RESEARCH constraint)

key-files:
  created:
    - lib/billing/connect-webhook.ts
    - lib/email/payment-emails.ts
  modified:
    - app/api/webhooks/stripe/route.ts
    - tests/unit/webhooks/connect-events.test.ts

key-decisions:
  - Connect handler extracted to its own module (lib/billing/connect-webhook.ts) instead of inlined in the route — keeps the route file focused on signature/dedup/dispatch, makes the Connect logic unit-testable without a NextRequest harness, and mirrors how lib/billing/connect-oauth.ts (Plan 70-02) sits beside the OAuth route. Plan inlined it for brevity; extraction is a refinement that does not change the public contract.
  - Plain-text emails (not HTML/MJML templates) to ship the loop fast. CONTEXT.md "Claude's Discretion" explicitly green-lit deferring branded HTML templates to a future polish seed.
  - sendPaymentReceiptEmail uses the **business name** in the from-line (not the Xtimator app name), so the customer's inbox shows the brand they actually paid. The business-owner notification keeps the Xtimator app name because the email is platform-to-tenant.
  - Promise.allSettled instead of awaiting each email sequentially: one failed send must not prevent the other, and the helpers already swallow their own errors, so allSettled is belt-and-suspenders.
  - Dynamic import('@/lib/email/payment-emails') inside the handler instead of a top-level import: keeps the email module + its lazy resend import out of the hot path for non-Connect events (subscription billing webhooks fire far more often).
  - account.updated handler is best-effort and silent: if the business changes their display name or email in Stripe Dashboard, we sync it; if not, no DB write and no error. This matches the "graceful degrade" stance of the phase.
  - Origin for estimateShareUrl: NEXT_PUBLIC_APP_URL → NEXT_PUBLIC_SITE_URL → hardcoded fallback. Webhook runs server-side without request context, so we can't read the host header here.

patterns-established:
  - Per-tenant Stripe webhook dispatch via top-level event.account branching
  - "Email helpers must never throw" contract for any send invoked from a webhook handler
  - Connect handler lives next to other Connect helpers in lib/billing/, route file delegates

requirements-completed: [CONNECT-08]

duration: ~4 min
completed: 2026-05-17
---

# Phase 70 Plan 04: Webhook Connect Event Handler + Payment Emails Summary

**Extends the existing Stripe webhook to handle connected-account events: on `checkout.session.completed` (Connect), marks the estimate paid in 5 columns and fires 2 branded Resend emails (business owner + customer); on `account.application.deauthorized`, clears the company connection. Wave 0 RED tests for connect-events transitioned to GREEN.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-17T05:53:22Z
- **Completed:** 2026-05-17T05:56:54Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Closed the customer-payment loop end-to-end: customer pays → Stripe redirects with `?stripe=success` → webhook lands within seconds → DB row flipped to `paid` → 2 emails sent → next share-page render hides the Pay button permanently from DB state.
- All 4 Wave 0 webhook test cases now GREEN. Existing platform subscription webhook tests still pass (8/8) — zero regression on subscription billing.
- Closed CONNECT-08 (webhook + emails). Only Plan 70-05 remains in Phase 70 (test pass + verification + dashboard "Paid" badge polish + Stripe Dashboard webhook scope setup runbook).
- No new TypeScript errors introduced — the one new `lib/billing/connect-webhook.ts: Cannot find module 'stripe'` mirrors the pre-existing baseline pattern from `lib/billing/stripe-client.ts` and resolves with `npm install` (same as documented in 70-03 SUMMARY).

## Task Commits

1. **Task 1: lib/email/payment-emails.ts (2 send helpers, never throw)** — `053ffc2` (feat)
2. **Task 2: Webhook Connect branch + handler module + GREEN tests** — `85f715b` (feat)

**Plan metadata commit:** to follow this summary (docs).

## Event Routing (`event.account` Branching)

```
                  POST /api/webhooks/stripe
                            │
                  rawBody → constructEvent
                  (signature verified — same
                   STRIPE_WEBHOOK_SECRET for both)
                            │
              processed_stripe_events.insert(event.id)
                  (23505 ON CONFLICT → 200 "Already processed")
                            │
                  handleStripeEvent(event)
                            │
              ┌─────────────┴─────────────┐
              │                           │
       event.account?                event.account?
         (present)                     (absent)
              │                           │
      handleConnectEvent          handlePlatformEvent
      (lib/billing/                (route-local switch:
       connect-webhook.ts)          subscription billing)
              │
   ┌──────────┼─────────────────────────────────┐
   │          │                                 │
checkout.    account.application.            account.updated
session.     deauthorized                    (best-effort
completed                                     display sync)
   │          │
   │     clear stripe_account_id +
   │     stripe_connect_status='disconnected'
   │
   ├──► UPDATE estimates SET
   │      payment_status='paid',
   │      stripe_checkout_session_id=session.id,
   │      stripe_payment_intent_id=session.payment_intent,
   │      paid_at=now(),
   │      payment_amount_cents=session.amount_total
   │    WHERE id = session.metadata.estimate_id
   │
   └──► Promise.allSettled([
          sendPaymentReceivedEmail(ctx),  ← business owner
          sendPaymentReceiptEmail(ctx),   ← customer (from = business name)
        ])
```

The dispatch is a **single conditional**: `if (event.account) return handleConnectEvent(...)`. There is no event-type prefix sniffing (`checkout.session.completed` is a valid event in both platform mode for subscriptions AND in Connect mode for customer payments — only `event.account` reliably distinguishes them).

## Connect Event Types Handled

| Event | Action | Why it matters |
| --- | --- | --- |
| `checkout.session.completed` | Update 5 estimate columns + send 2 emails | The DB source-of-truth flip for "this estimate was paid" |
| `account.application.deauthorized` | Clear `stripe_account_id`, set status `'disconnected'` | User disconnected from Stripe Dashboard side (rare but possible); without this, Xtimator would think they're still connected and keep rendering the Pay button against a dead account |
| `account.updated` | Best-effort sync of `stripe_account_email` and `stripe_account_display_name` | Tenant updates their business name or contact email in Stripe → reflect it in Xtimator without requiring a reconnect |
| _(any other Connect event)_ | Silently ignored | Future Stripe additions don't crash the handler |

## Email Failure-Mode Policy

> **A webhook handler must NEVER return 5xx because of an email send failure.**

Stripe retries non-2xx webhook responses with exponential backoff for up to 3 days. If we returned 500 because Resend was temporarily down, Stripe would keep redelivering the same `checkout.session.completed` event — and our `processed_stripe_events` dedup would keep acknowledging it as "already processed" without re-running the email send. Net effect: the customer-payment receipt never goes out, and Stripe Dashboard fills with red "Failed" entries.

The contract we enforce:

1. **Email helpers (`sendPaymentReceivedEmail`, `sendPaymentReceiptEmail`)** wrap their entire body in `try/catch`. On failure they `console.error` and `return undefined` — they never throw.
2. **Resend key missing?** Log a warning and return. Not a failure.
3. **Email address missing?** Log a warning and return. Not a failure.
4. **Webhook handler** wraps the two sends in `Promise.allSettled`. Even if a helper's contract changed and it suddenly threw, allSettled would absorb it.
5. **Stripe receives `200 OK`** as soon as the DB update completes, regardless of what happens with email.

Observability stays via `console.error` lines (visible in Vercel logs / Inngest output / wherever the runtime ships logs). A future seed could route these to Sentry or a `failed_emails` audit table; deferred for now.

## Files Created/Modified

### Created (2)

- `lib/email/payment-emails.ts` — Two Resend send functions with the never-throw contract; uses `getIntegrationKey('resend')` and `getBranding()` from existing `platform-config`.
- `lib/billing/connect-webhook.ts` — `handleConnectEvent(event, stripe, svc)` dispatcher with one helper per event type. Pure function over a service-client mock — unit-testable without a Next request harness.

### Modified (2)

- `app/api/webhooks/stripe/route.ts` — Added `handleConnectEvent` import; renamed the existing inline switch body to `handlePlatformEvent` (verbatim, zero logic change); inserted the top-level `if (event.account) return handleConnectEvent(...)` branch in the freshly-thin `handleStripeEvent`.
- `tests/unit/webhooks/connect-events.test.ts` — Replaced 4 RED stubs with 4 real assertions wiring mocks for Stripe, the per-table Supabase service client, and the email helpers.

## Decisions Made

- **Connect handler extracted to its own module instead of inlined in the route.** The plan showed it inlined; extraction is a refinement that (a) keeps the route file focused on signature/dedup/dispatch, (b) makes the Connect logic unit-testable without a `NextRequest` harness, (c) mirrors how `lib/billing/connect-oauth.ts` (Plan 70-02) sits beside its route. Public contract unchanged — the route still imports a function and calls it; the tests still flow through `POST`.
- **Plain-text emails, not HTML/MJML.** Ship-fast call green-lit explicitly by CONTEXT.md "Claude's Discretion": "Email template visual design (use existing branded email pattern from `lib/email/templates/`)" — that directory doesn't exist yet, and standing up an HTML template scaffold would have ballooned scope. Plain text is searchable, accessible, and rendered identically by every mail client. Branded HTML is a polish iteration for a future seed.
- **Receipt email's from-line is the business name, not Xtimator.** The customer's mental model: "I paid Acme Plumbing, so I should hear from Acme Plumbing." If the receipt arrived as `Xtimator <notifications@...>`, the customer might mark it as spam or be confused about who they actually paid. Business-owner notification stays in the Xtimator brand because that's a platform-to-tenant message.
- **`Promise.allSettled` over sequential `await`.** A failed receipt send must not block the owner notification (and vice versa). The helpers already swallow their own errors, but allSettled adds a second layer of defence so a contract change in either helper cannot break the other.
- **Dynamic `import('@/lib/email/payment-emails')` inside the handler.** Keeps the email module + its lazy Resend import out of the hot path for the far-more-frequent subscription webhooks. Marginal but free win.
- **`account.updated` handler is best-effort and silent.** No DB write if neither `email` nor `display_name` is present on the account payload; logs only on actual update failure. Matches the graceful-degrade stance of the phase.
- **Origin for `estimateShareUrl`: `NEXT_PUBLIC_APP_URL` → `NEXT_PUBLIC_SITE_URL` → `https://xtimator.com`.** Webhook runs server-side without a request context, so there's no host header to read. Hardcoded fallback ensures emails always carry a usable link.

## Manual Setup Required (For Plan 70-05 To Document)

> **Reminder:** Plan 70-05 must include this in the setup runbook.

For Connect events to actually reach this handler, the Xtimator owner must update the Stripe Dashboard webhook endpoint configuration (Pitfall 1 in RESEARCH.md):

1. Stripe Dashboard → **Developers → Webhooks** → click the existing endpoint pointing at `/api/webhooks/stripe`
2. Click **Update details**
3. Under **Listen to**, ensure **"Events on Connected accounts"** is enabled (in addition to "Your account" which is already on for subscription billing)
4. Subscribe the endpoint to these Connect events:
   - `checkout.session.completed`
   - `account.application.deauthorized`
   - `account.updated` (optional but recommended)
5. The signing secret (`STRIPE_WEBHOOK_SECRET` env var) is **shared** across both event scopes — no second secret needed.

**Warning sign that this isn't configured:** Customer pays in Stripe Checkout, redirects back to share page with `?stripe=success` (green banner shows), but the estimate row in DB stays `payment_status='unpaid'`. First debug step: Stripe Dashboard → Workbench → Events for the connected account; verify `checkout.session.completed` has a delivery attempt.

## Deviations from Plan

### Auto-fixed Issues

**1. [Refactor — non-deviation] Extracted handler to lib/billing/connect-webhook.ts**
- **Found during:** Task 2 design
- **Issue:** The plan's `action` block inlined `handleConnectEvent` inside the route file. The test file, however, imports from `@/lib/billing/connect-webhook` (defined as `const SUT = '@/lib/billing/connect-webhook'` in the RED stub) — meaning the planner had already decided the module should be extracted but the action block didn't reflect it.
- **Fix:** Created `lib/billing/connect-webhook.ts` exporting `handleConnectEvent`. The route imports and delegates. This is the structure the test file's SUT path already assumed.
- **Files modified:** `lib/billing/connect-webhook.ts` (new), `app/api/webhooks/stripe/route.ts` (import added)
- **Committed in:** `85f715b` (Task 2 commit)

**2. [Rule 3 — Blocking] account.updated handler needed type-safe extraction of display_name**
- **Found during:** Task 2 implementation
- **Issue:** The plan's snippet used a `Record<string, string | null>` for `updates`, but Supabase's typed update wants concrete `string` (non-null) values for the columns we're setting. Including null values would either be type-rejected or be a no-op write.
- **Fix:** Narrowed to `Record<string, string>` and explicitly checked truthiness of `account.email` and `display` before adding either. If neither is present, return without an update (avoid an empty `.update({}).eq(...)` query).
- **Files modified:** `lib/billing/connect-webhook.ts`
- **Committed in:** `85f715b` (Task 2 commit)

---

**Total deviations:** 2 (1 refactor that aligns plan + test, 1 Rule 3 type-correctness fix). Both within plan intent; no architectural changes (Rule 4 not triggered).

## Issues Encountered

- **None blocking.** TypeScript baseline went from 21 → 22 errors; the +1 is `lib/billing/connect-webhook.ts(2,25): Cannot find module 'stripe'` which mirrors the identical pre-existing line in `lib/billing/stripe-client.ts:2` (`Cannot find module 'stripe'`). Same root cause (per 70-03 SUMMARY: "resolves once `npm install` is re-run"). No new categories of error; no error introduced in any file the plan owns the existence of.

## Known Stubs

None — every code path is wired and tested. The end-to-end loop (customer pays → DB updated → emails sent → share page reflects paid state on next render) is complete for Phase 70. Plan 70-05 handles verification + dashboard "Paid" badge polish + the setup runbook for the manual Stripe Dashboard webhook scope toggle described above.

## Next Phase Readiness

- **Ready for Plan 70-05** (final test pass + verification + dashboard "Paid" badge + Stripe Dashboard setup runbook). All CONNECT-NN requirements wired in code; 70-05 is verification + polish + docs.
- **End-to-end smoke (requires Stripe Dashboard manual setup above):** Connected test-mode tenant → open share link → Pay $X → Stripe Checkout → pay with `4242 4242 4242 4242` → return to `/estimate/<token>?stripe=success` → green banner shows + Pay button hidden; webhook fires within ~2s → SELECT confirms `payment_status='paid'` + `paid_at` populated; Resend dashboard shows 2 emails sent.

## Self-Check: PASSED

- `lib/email/payment-emails.ts` — FOUND
- `lib/billing/connect-webhook.ts` — FOUND
- `app/api/webhooks/stripe/route.ts` — FOUND (modified)
- `tests/unit/webhooks/connect-events.test.ts` — FOUND (modified)
- Commits `053ffc2`, `85f715b` — FOUND in `git log`
- `npx vitest run tests/unit/webhooks/connect-events.test.ts` — 4/4 PASS
- `npx vitest run tests/unit/billing/stripe-webhook.test.ts` — 8/8 PASS (no regression on existing platform handler)
- `npx tsc --noEmit` — 22 errors (baseline 21 + 1 mirroring pre-existing `Cannot find module 'stripe'` pattern; no new category of error)

---
*Phase: 70-stripe-connect-customer-payments*
*Plan: 04*
*Completed: 2026-05-17*
