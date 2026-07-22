---
phase: 176-end-customer-consent-optout-quiet-hours
plan: 05
subsystem: api
tags: [twilio, webhook, sms, hmac-sha1, opt-out, consent, idempotency]

# Dependency graph
requires:
  - phase: 176-01
    provides: "clients.phone_normalized/sms_opted_out_at/sms_consent_status/method/recorded_at + client_message_events audit table"
  - phase: 176-02
    provides: "verifyTwilioSignature (HMAC-SHA1) + classifyInboundKeyword (stop/start/help/other)"
provides:
  - "POST /api/webhooks/twilio — the first inbound Twilio webhook this codebase has ever had"
  - "Real end-customer STOP/START/HELP -> clients.sms_opted_out_at / sms_consent_status suppression-state writes"
affects: ["176-04 (pre-send suppression gate now has real data to key off)", "Phase 177 (Twilio number/Messaging Service provisioning — must point 'A Message Comes In' at this route)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Twilio inbound webhook shape: raw text body first, x-www-form-urlencoded (not JSON) parsed via URLSearchParams -> Object.fromEntries, signing URL built from resolveBaseUrl(request) + fixed path (never request.url), signature check before any DB access, never-throw catch-all after auth passes (always 200 to avoid Twilio retry storms)"
    - "Phone matching via a single indexed phone_normalized equality (last-10-digit), not fragile exact-string candidate arrays"
    - "STOP is an unconditional per-row fan-out across every matching company; START is a conditional per-row fan-out that only restores prior-'revoked' rows to 'granted', leaving 'unknown' rows untouched — consent is never manufactured from a bare keyword"

key-files:
  created:
    - app/api/webhooks/twilio/route.ts
    - tests/unit/webhooks/twilio-inbound.test.ts
  modified: []

key-decisions:
  - "Single batched insert() call per inbound event (an array of 1..N rows) rather than N separate insert calls per matched company — one DB round-trip either way, same audit-row shape"
  - "requireServiceClient() is called only AFTER the signature check passes (inside the try block), mirroring the WhatsApp webhook's pattern, so a forged/unconfigured request touches zero DB clients"
  - "Logged a pre-existing, unrelated bare-tsc drift (8 errors in tests/ai, tests/billing, tests/inngest, tests/schemas — none touched by this plan) to deferred-items.md rather than fixing it, per the scope-boundary rule; tsconfig.ci.json (the actual CI gate, excludes tests/**) is clean"

patterns-established:
  - "Pattern: inbound provider webhooks (Twilio here, mirroring WhatsApp) do signature verification synchronously before any body parsing/DB access, then hand off to a never-throw try/catch for the mutation phase, always returning 200 once auth has passed"

requirements-completed: [CUST-03]

# Metrics
duration: 18min
completed: 2026-07-21
---

# Phase 176 Plan 05: Inbound Twilio Webhook — Verify, Classify, Suppress, Audit Summary

**`POST /api/webhooks/twilio` — signature-secured (HMAC-SHA1 over the Coolify-proxy-safe `resolveBaseUrl` URL), idempotent on `MessageSid`, phone-matched via the `phone_normalized` generated column, with sender-agnostic cross-company STOP suppression fan-out and a consent-preserving START that never upgrades an `'unknown'` row to `'granted'`.**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-07-21T22:25:05-04:00
- **Tasks:** 1
- **Files modified:** 2 (both created)

## Accomplishments
- Xtimator's first-ever inbound Twilio webhook exists: `app/api/webhooks/twilio/route.ts`, closing Pitfall 10 (HIGH/legal) — until now there was no mechanism by which a real end-customer STOP/START/HELP reply could ever reach `clients.sms_opted_out_at`/`sms_consent_status`, since Twilio's own carrier-level Advanced Opt-Out block is real but not queryable by this app
- A forged POST (bad signature, or Twilio unconfigured) is rejected with a logged 401 before any DB write — signature verification runs against a URL built from `resolveBaseUrl(request)`, never `request.url`/`request.nextUrl`, closing the documented Coolify reverse-proxy pitfall (would otherwise silently 401-reject every real Twilio POST in production forever)
- STOP suppresses **every** `clients` row matching the sender's last-10-digit phone across **every** company (sender-agnostic fan-out, since the Messaging Service is shared platform-wide); START clears suppression everywhere but only restores `'granted'` on rows whose prior status was `'revoked'` — an `'unknown'` row is never silently upgraded into "has consent"
- Every inbound event is logged to `client_message_events`, including replies that match no client anywhere (`client_id`/`company_id` left null for manual reconciliation) — never silently dropped
- The same `MessageSid` delivered twice (Twilio's at-least-once redelivery) is only processed once, via a check-then-insert idempotency guard with a documented benign TOCTOU (downstream `clients` mutations are themselves idempotent, so the only race consequence is an occasional duplicate audit row, never wrong suppression/consent state)
- An internal error during the DB-mutation phase never propagates to Twilio as a non-2xx (which would trigger retry storms) — it's caught, logged via `console.error`, and still answers 200
- 14 unit tests, all green, independently proving: signature rejection (logged), unconfigured-Twilio rejection (logged), single-match suppression, cross-company STOP fan-out, unresolved-never-dropped, START re-consent-only-from-revoked, START never-upgrades-unknown, cross-company START fan-out (mixed revoked/unknown), other-reply no-mutation, HELP no-mutation, idempotency, `phone_normalized`-based matching (digit-stripped), the Coolify-proxy URL fix, and never-throw-on-internal-error

## Task Commits

Each task was committed atomically:

1. **Task 1: Inbound Twilio webhook — verify, classify, suppress, audit** - `6e128644` (feat)

**Plan metadata:** (this commit) docs(176-05): complete inbound Twilio webhook plan

_No TDD RED/GREEN split — the plan's single task combined test authoring and implementation as one commit; both the route and its 14-test suite were written together and verified green before committing (functionally equivalent to TDD given the tests were designed from the plan's `<behavior>` spec before the implementation was finalized)._

## Files Created/Modified
- `app/api/webhooks/twilio/route.ts` - `POST` handler: raw-body-first, `x-twilio-signature` verification via `verifyTwilioSignature` against a `resolveBaseUrl`-built URL, `getTwilioConfig()` fail-closed gate, `URLSearchParams`-decoded form params, `classifyInboundKeyword`-driven STOP/START/HELP/other branching, per-row `phone_normalized`-matched suppression fan-out, never-drop `client_message_events` audit insert, idempotency guard on `twilio_message_sid`, never-throw catch-all
- `tests/unit/webhooks/twilio-inbound.test.ts` - 14 tests covering every behavior bullet in the plan's `<behavior>` block, mocking `verifyTwilioSignature`, `getTwilioConfig`, `requireServiceClient`, and `resolveBaseUrl` while exercising the real `classifyInboundKeyword`

## Decisions Made
- Used a single batched `insert()` call (array of 1..N rows) for the `client_message_events` fan-out rather than N separate insert calls — simpler, same audit outcome, and matches the plan's "(or two separate insert calls)" allowance
- `requireServiceClient()` is invoked only after the signature check passes (inside the try block), so a rejected/forged request never touches the service client at all — verified directly in the signature-rejection test (`svc.from` never called)
- Followed the plan's revised (post-plan-check) semantics exactly: `phone_normalized` equality matching (not 3-candidate exact-string), START's prior-status-gated consent restoration, and `console.warn`-logged signature/config rejections

## Deviations from Plan

None - plan executed exactly as written (the revised version, post-plan-check). All three checker-revision fixes (phone_normalized-based matching, START never manufacturing consent, logged rejections) were implemented as specified in the plan's interfaces section.

**Out-of-scope discovery (not fixed, logged only):** a full-repo bare `npx tsc --noEmit` run (in addition to the plan's required scoped `tsc -p tsconfig.ci.json`, which is clean) surfaced 8 pre-existing type errors in unrelated test files (`tests/unit/ai/*`, `tests/unit/billing/*`, `tests/unit/inngest/*`, `tests/unit/schemas/estimate-bounds.test.ts`) — none touch this plan's files. Logged to `.planning/phases/176-end-customer-consent-optout-quiet-hours/deferred-items.md` per the scope-boundary rule rather than fixed here.

## Issues Encountered
None. Sibling executor 176-04 was active concurrently in `lib/notifications`/`tests/unit/notifications` during this plan's execution (its `176-04-SUMMARY.md` landed on `main` mid-session); all git operations here were pathspec-scoped (`git add`/`git commit` with explicit file arguments) to `app/api/webhooks/twilio/route.ts` and `tests/unit/webhooks/twilio-inbound.test.ts` only, with no cross-contamination.

## User Setup Required

**Operational runbook note (required by the plan's `<output>` spec):** the Twilio Console's "A Message Comes In" webhook URL for the number/Messaging Service Phase 177 will provision MUST byte-match `resolveBaseUrl(request) + '/api/webhooks/twilio'` in production. Concretely, that resolves (per `lib/utils/site-url.ts`'s precedence) to `${APP_ORIGIN or NEXT_PUBLIC_SITE_URL}/api/webhooks/twilio`. If `APP_ORIGIN`/`NEXT_PUBLIC_SITE_URL` ever changes, the Twilio Console webhook URL must be updated to match, or **signature verification silently fails 100% of the time from that point on** — every real inbound SMS gets a logged 401 and Twilio's dashboard will show delivery failures, but nothing in this app's own logs will look like an outage (the app-side symptom is just a stream of `console.warn('[Twilio] webhook signature rejected', ...)` lines). Phase 177's provisioning step should explicitly re-verify this byte-match as part of setup.

No other external service configuration required for this plan — `getTwilioConfig()` (Twilio account SID/auth token/from-phone) is already wired via `platform_integrations` from earlier phases (104/163); this plan reads it, doesn't provision it.

## Next Phase Readiness
- `app/api/webhooks/twilio/route.ts` is fully implemented and unit-tested; CUST-03's second hard requirement (a working inbound webhook feeding real suppression state) is now closed
- 176-04's pre-send suppression gate (`assertSendAllowed()`) now has a real, live-updatable data source (`clients.sms_opted_out_at`/`sms_consent_status`) instead of columns nothing ever writes to
- Blocker for actually receiving live traffic: no Twilio phone number/Messaging Service exists yet — Phase 177 provisions it and must point its "A Message Comes In" webhook at this route per the runbook note above
- This route ships fully unit-tested against mocked/forged payloads only (per the plan's explicit scope) — no live-Twilio integration test exists yet, matching Phase 176's stated boundary

---
*Phase: 176-end-customer-consent-optout-quiet-hours*
*Completed: 2026-07-21*

## Self-Check: PASSED

Both created files confirmed present on disk (`app/api/webhooks/twilio/route.ts`, `tests/unit/webhooks/twilio-inbound.test.ts`); task commit hash (`6e128644`) confirmed in git log.
