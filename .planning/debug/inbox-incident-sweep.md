---
status: awaiting_human_verify
trigger: "encontre todos esses problemas aqui, precisamos resolvelos"
created: 2026-07-25
updated: 2026-07-25
---

# Debug Session: Inbox Incident Sweep

## Symptoms

- **Expected behavior:** GitHub Test workflows pass on `main` and `dev`; Stripe webhooks deliver successfully; production has no actionable Sentry errors.
- **Actual behavior:** The supplied inbox screenshot shows failed Test runs for commits `a331265`, `adc683a`, and `c1c3f96`; a Stripe webhook-delivery warning; and Sentry notifications for XTIMATOR-2, XTIMATOR-3, and XTIMATOR-D.
- **Error messages:** `TypeError: Failed to parse body as FormData`; `Failed to find Server Action`; `You cannot use different slug names for the same dynamic path`.
- **Timeline:** Notifications span 2026-07-08 through 2026-07-24.
- **Reproduction:** Correlate each notification with GitHub Actions, Sentry production events, current route layout, Stripe webhook implementation, and the current production deployment.

## Current Focus

- **hypothesis:** Confirmed: all inbox entries except XTIMATOR-2 were historical and already fixed. XTIMATOR-2 recurred because the scanner-noise filter only recognized the old `POST /_not-found/page` transaction while current Next.js reports the same malformed multipart probes as `POST /page`. The full-suite investigation also confirmed a separate landing-page test race caused by dynamically importing the real 600+ line AuthDialog under CI load.
- **test:** Exact workflow logs and Sentry events inspected; focused regressions, scoped lint/typecheck, two complete CI test passes, production build, production health probe, and unsigned Stripe webhook probe completed.
- **expecting:** Satisfied for code/CI/Sentry: historical workflow failures map to later green commits; XTIMATOR-3 and XTIMATOR-D have no actionable open state; malformed root-page multipart probes are filtered without suppressing FormData errors on real API routes; the landing auth-param test is deterministic under full-suite load. Stripe's route reaches signature verification and has no customer billing data at risk, but the registered endpoint/delivery history still requires an authenticated Dashboard check.
- **next_action:** User signs in to the Stripe Dashboard in the in-app browser, then the endpoint status and failed-delivery history can be verified read-only.

## Evidence

- timestamp: 2026-07-25
  observation: "GitHub current main/dev HEAD 041820a has successful Test runs and successful Build and Deploy runs."
- timestamp: 2026-07-25
  observation: "Sentry search over 90 days returned exactly one unresolved issue, XTIMATOR-2; XTIMATOR-3 and XTIMATOR-D are no longer unresolved."
- timestamp: 2026-07-25
  observation: "XTIMATOR-2 events are system-only POST /page multipart-boundary failures, affect zero users, and repeatedly originate from a Falkenstein datacenter while presenting changing browser/OS combinations."
- timestamp: 2026-07-25
  observation: "The existing server filter drops malformed Server Action IDs and the legacy POST /_not-found/page scanner transaction, but not current POST /page malformed FormData events."
- timestamp: 2026-07-25
  observation: "GitHub run 30131926372 failed two branding-action tests because fake PNG bytes became invalid once WebP conversion was added; commit 61302bb2 mocked conversion and current CI is green."
- timestamp: 2026-07-25
  observation: "GitHub run 29780798328 failed five tests because Supabase mocks lacked new select/is chain methods; commit d49051b6 repaired the mock shapes and current CI is green."
- timestamp: 2026-07-25
  observation: "GitHub run 28987905916 failed one document-alignment snapshot; commit 883faf71 refreshed the stale snapshot."
- timestamp: 2026-07-25
  observation: "XTIMATOR-D is resolved; commit 561aece6 unified the first estimate route segment under [token], eliminating the companySlug/token dynamic-name collision."
- timestamp: 2026-07-25
  observation: "Production /api/health returned ok/db ok/storage ok at commit 041820a; an intentionally invalid Stripe signature returned 400 signature-verification failure, proving the configured webhook route is reachable and does not take the missing-key 503 path."
- timestamp: 2026-07-25
  observation: "The first local full-suite pass exposed the previously documented landing-page AuthDialog dynamic-import timeout; replacing the heavy dialog with a contract-focused test mock made the isolated test pass repeatedly and both CI-equivalent full-suite passes complete with 535 files passed, 4312 tests passed, 1 skipped, and 21 todo."
- timestamp: 2026-07-25
  observation: "Next.js production build compiled, typechecked, generated all 93 static pages, and listed both /estimate/[token] routes plus /api/webhooks/stripe successfully."
- timestamp: 2026-07-25
  observation: "Sentry XTIMATOR-2 was set to ignored-until-escalating with the root-cause/fix note; a fresh 90-day is:unresolved search returned zero issues."
- timestamp: 2026-07-25
  observation: "Production database has zero processed_stripe_events and zero companies with a Stripe subscription, customer, or Connect account; no customer charge/subscription event was lost, but there is no successful event delivery available to prove the signing-secret match."
- timestamp: 2026-07-25
  observation: "Stripe Dashboard read-only verification was attempted but requires user authentication; no authenticated alternate browser session is available."

## Eliminated

- hypothesis: "The current main/dev branches are still blocked by the three workflow failure emails."
  reason: "Both branches now point to 041820a and their latest Test workflows completed successfully; production deploys from that SHA also succeeded."
- hypothesis: "The Stripe webhook is currently missing its production key or route."
  reason: "The live endpoint reached signature verification and returned the expected 400 for an invalid signature; missing Stripe configuration would have returned the route's explicit 503."
- hypothesis: "XTIMATOR-2 is caused by Xtimator's real refine/upload FormData route."
  reason: "Every retained event is POST /page with system-only Undici frames, zero affected users, datacenter origin, and varying claimed browser/OS; the real multipart route is /api/estimates/[id]/refine."

## Resolution

- **root_cause:** The screenshot mixed historical notifications with one still-open scanner-noise issue. XTIMATOR-2's original filter no longer matched Next.js's new `POST /page` transaction name. Separately, the landing auth-param test imported the full dynamic dialog and raced its 3-second wait under full-suite load. The Stripe email cannot be attributed more precisely from its subject alone; no customer Stripe records or successfully processed webhook events exist in the production database.
- **fix:** Added a transaction-and-message-scoped root-page malformed-FormData Sentry filter and wired it into the server beforeSend hook; added positive/negative regression tests; mocked the heavy AuthDialog only in the landing state-transition unit test; marked XTIMATOR-2 ignored until escalating with cause/fix documentation.
- **verification:** Focused 15/15 tests passed; landing test passed repeatedly; production typecheck and scoped lint exited 0; CI-equivalent unit/eval suite passed twice (535 files, 4312 tests each pass); Next.js production build exited 0 and generated 93 static pages; live health returned ok at 041820a; live Stripe endpoint reached signature verification and returned 400 for an invalid signature; production DB confirmed zero customer Stripe state at risk; Sentry 90-day unresolved search returned zero. Pending human-authenticated Stripe Dashboard endpoint/delivery-history check.
- **files_changed:** `.planning/debug/inbox-incident-sweep.md`, `instrumentation.ts`, `lib/observability/sentry-filters.ts`, `tests/unit/observability/sentry-filters.test.ts`, `tests/unit/components/landing-page.test.tsx`
