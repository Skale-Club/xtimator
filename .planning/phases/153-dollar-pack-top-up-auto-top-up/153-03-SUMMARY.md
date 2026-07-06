---
phase: 153-dollar-pack-top-up-auto-top-up
plan: 03
subsystem: payments
tags: [stripe, checkout-setup-session, webhooks, server-actions, react, next.js, tailwind]

# Dependency graph
requires:
  - phase: 153-01
    provides: DEFAULT_BILLING_CONFIG.topUpPacks (3 dollar packs) — the Select options in AutoTopupDialog
  - phase: 153-02
    provides: "companies auto_topup_* columns, autoTopupEnabled kill switch, lib/billing/auto-topup.ts's triggerAutoTopupIfNeeded/chargeAutoTopup (unmodified by this plan — this plan only feeds it a payment method + tenant configuration)"
provides:
  - "POST /api/billing/create-autotopup-setup-session — mode:'setup' Checkout Session for capturing a reusable payment method outside a live purchase"
  - "checkout.session.completed webhook arm (metadata.type === 'autotopup_setup') attaching the resulting payment method as the customer's default_payment_method"
  - "lib/actions/auto-topup.ts: saveAutoTopupSettings (server-side payment-method + pack-index + threshold guards) / disableAutoTopup"
  - "AutoTopupCard + AutoTopupDialog UI on Settings > Plans, gated behind billing_config.autoTopupEnabled"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mode:'setup' Checkout Session (no line_items) as the ONLY payment-method-capture mechanism — zero Stripe Elements dependency, zero raw card-input code"
    - "New webhook arm inserted BEFORE the existing subscription-mode fall-through (same defensive ordering as the credit_topup arm from Phase 113)"
    - "Server action independently re-verifies payment-method existence via stripe.customers.retrieve(...).invoice_settings.default_payment_method — never trusts client-submitted enabled:true"
    - "Dollar-to-credits conversion happens at the single UI call site (AutoTopupDialogLauncher.handleSave), not inside MoneyInput or the server action"

key-files:
  created:
    - app/api/billing/create-autotopup-setup-session/route.ts
    - lib/actions/auto-topup.ts
    - components/billing/auto-topup-card.tsx
    - components/billing/auto-topup-dialog.tsx
    - tests/unit/billing/autotopup-setup-session.test.ts
    - tests/unit/billing/auto-topup-settings.test.ts
  modified:
    - app/api/webhooks/stripe/route.ts
    - app/(app)/settings/billing/page.tsx
    - tests/unit/billing/stripe-webhook.test.ts
    - tests/unit/billing/billing-config.test.ts

key-decisions:
  - "Payment-method capture is Stripe-hosted Checkout mode:'setup' ONLY — no Stripe Elements, no raw card fields anywhere in this codebase (CONTEXT.md hard constraint, verified by a static grep in acceptance criteria)"
  - "The webhook's autotopup_setup arm is positioned between the credit_topup arm's break and the subscription companyId/mode check — the exact ordering Research Pitfall 1 flags as load-bearing (an arm placed after the subscription fall-through would be unreachable)"
  - "saveAutoTopupSettings re-derives payment-method existence from Stripe itself (stripe.customers.retrieve + expand) rather than trusting any client-supplied boolean — closing research Pitfall 2's exact gap"
  - "AutoTopupCard is omitted from the render tree entirely (not rendered-disabled) when billing_config.autoTopupEnabled is false — matches the same pattern used for the kill-switch gate elsewhere in this milestone"
  - "The Settings > Plans page's Stripe payment-method-label read (masked brand/last4 display) is wrapped in try/catch defaulting to null — a Stripe hiccup on this read-only display must never 500 the whole Plans page"

requirements-completed: [CREDITUI-07]

# Metrics
duration: 22min
completed: 2026-07-05
---

# Phase 153 Plan 03: Auto-Top-Up Tenant UI Summary

**Built the Stripe-hosted mode:'setup' payment-method-capture route, the webhook arm that attaches it as the customer's default, the tenant-facing settings server actions (with an independent server-side payment-method re-verification), and the AutoTopupCard/AutoTopupDialog UI wired into Settings > Plans — closing the auto-top-up feature end to end on top of Plan 02's safety core.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-05T20:30:24Z (approx)
- **Completed:** 2026-07-05T20:44:57Z (approx)
- **Tasks:** 3
- **Files modified:** 4 modified, 6 created

## Accomplishments
- New `POST /api/billing/create-autotopup-setup-session` creates a `mode:'setup'` Checkout Session (no `line_items`) scoped to the authenticated tenant's own company, mirroring `create-topup-session`'s auth/demo-guard/company-lookup shape exactly.
- New webhook arm (`checkout.session.completed`, `metadata.type === 'autotopup_setup'`) retrieves the completed SetupIntent and sets the resulting payment method as the Stripe customer's `default_payment_method` — positioned before the subscription-mode fall-through so it can never be shadowed.
- New `lib/actions/auto-topup.ts`: `saveAutoTopupSettings` independently re-verifies, server-side, that (a) the platform kill switch is on, (b) a real default payment method exists on the Stripe customer (never trusting client state), and (c) the threshold is a positive integer and the pack index is within the live `billing_config.topUpPacks` range — before ever persisting `auto_topup_enabled: true`. `disableAutoTopup` is a simple reversible toggle.
- New `AutoTopupCard` (server component) + `AutoTopupDialog`/`AutoTopupDialogLauncher` (client) render on Settings > Plans, gated entirely behind `billing_config.autoTopupEnabled` — showing enabled/disabled/failed states with every dollar figure derived from `billing_config.topUpPacks`/company columns, never hardcoded.
- Zero raw card-input UI and zero new Stripe Elements dependency anywhere in this phase (verified by static grep).

## Task Commits

Each task was committed atomically:

1. **Task 1: Setup-session route + webhook arm for payment-method capture** - `9631a2e0` (feat)
2. **Task 2: Settings-save server actions with server-side payment-method + pack-index guards** - `23a4dc9e` (feat)
3. **Task 3: AutoTopupCard + AutoTopupDialog UI, wired into Settings > Plans** - `037efc69` (feat)

_TDD flow: Task 1 and Task 2 each wrote/extended their test files alongside the implementation and ran them to green before committing (14 + 8 assertions respectively). Task 3 is presentational composition over already-tested server logic (no new test file, per the plan's explicit convention matching Plan 01 Task 3's precedent), verified by the full `tests/unit/billing/` suite staying green plus the acceptance-criteria greps._

## Files Created/Modified
- `app/api/billing/create-autotopup-setup-session/route.ts` (new) - `mode:'setup'` Checkout Session route, no `line_items`, metadata `{ type: 'autotopup_setup', companyId }`
- `app/api/webhooks/stripe/route.ts` - new `checkout.session.completed` arm for `metadata.type === 'autotopup_setup'`, positioned before the subscription-mode fall-through
- `lib/actions/auto-topup.ts` (new) - `saveAutoTopupSettings` (kill-switch + payment-method + pack-index + threshold guards) / `disableAutoTopup`
- `components/billing/auto-topup-card.tsx` (new) - Settings > Plans card, enabled/disabled/failed states
- `components/billing/auto-topup-dialog.tsx` (new) - `AutoTopupDialogLauncher` (button) + the manage-auto-top-up modal (threshold `MoneyInput`, pack `Select`, payment-method display/setup redirect, Save/Cancel/Turn off)
- `app/(app)/settings/billing/page.tsx` - fetches the company's `auto_topup_*` columns + a masked payment-method label (try/catch-guarded Stripe read) and renders `AutoTopupCard` only when `cfg.autoTopupEnabled`
- `tests/unit/billing/autotopup-setup-session.test.ts` (new) - 4 tests: setup-session shape, 401, demo-block, no line_items
- `tests/unit/billing/stripe-webhook.test.ts` - extended `getStripeClient` mock with `setupIntents.retrieve`/`customers.update`; new describe block covering the attach-default-payment-method behavior + the Pitfall-1 regression guard (companies.update never called for this event)
- `tests/unit/billing/auto-topup-settings.test.ts` (new) - 8 tests covering all `saveAutoTopupSettings`/`disableAutoTopup` guards + the demo block
- `tests/unit/billing/billing-config.test.ts` - added `lib/actions/auto-topup.ts` to the BILLCFG-03 dormancy-guard allowlist (see Deviations)

## Decisions Made
- The webhook arm reads `session.setup_intent` and calls `stripe.setupIntents.retrieve` then `stripe.customers.update({ invoice_settings: { default_payment_method } })` — exactly the interface the plan specified, with no changes needed.
- `saveAutoTopupSettings` performs its own `stripe.customers.retrieve(..., { expand: ['invoice_settings.default_payment_method'] })` call rather than trusting the `companies.stripe_customer_id` presence alone — a customer could exist without a default payment method (e.g. between setup-session creation and completion), so this is the load-bearing check.
- `AutoTopupDialogLauncher`'s dollar-to-credits conversion (`Math.round(thresholdDollars * 100)`) happens at the one call site inside `handleSave`, kept out of `MoneyInput` (a generic currency component) and out of the server action (which only validates integers), per the plan's explicit intent.
- The Settings > Plans page's payment-method label derivation (`Visa •••• 4242`-style) reads `pm.card.brand`/`pm.card.last4` from the expanded Stripe customer object and defaults to `null` (rendering the "Add payment method" affordance) on any failure — a read-only display must never crash the whole page.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `getAuthContext`'s inferred return type didn't narrow cleanly under `tsc --noEmit`**
- **Found during:** Task 3, running `npx tsc --noEmit` as part of pre-commit verification (per the plan's Task 3 acceptance criteria)
- **Issue:** `lib/actions/auto-topup.ts`'s `getAuthContext()` returned an object literal `{ supabase, companyId }` on success with no explicit return type annotation. TypeScript's inferred union (`DemoDenied | {error:...} | {error:...} | {supabase; companyId; error?: undefined}`) didn't structurally narrow against `saveAutoTopupSettings`/`disableAutoTopup`'s declared `Promise<{ success: true } | { error: string }>` return type after the `if ('error' in ctx) return ctx` guard — `tsc` flagged 2 real type errors (`TS2322`) at both call sites.
- **Fix:** Gave `getAuthContext` an explicit return type (`Promise<{ error: string } | { companyId: string }>`) and dropped the unused `supabase` field from the success branch (neither action reads `ctx.supabase` — both call `requireServiceClient()` directly, unlike `lib/actions/settings.ts`'s pattern which does use the RLS-bound client).
- **Files modified:** `lib/actions/auto-topup.ts`
- **Verification:** `npx tsc --noEmit` — both `auto-topup.ts` errors resolved (confirmed via a scoped grep of the tsc output); `npx vitest run tests/unit/billing/auto-topup-settings.test.ts` still 8/8 green after the fix.
- **Committed in:** `037efc69` (Task 3 commit)

**2. [Rule 1 - Bug] `lib/actions/auto-topup.ts` tripped the pre-existing `BILLCFG-03` dormancy-guard allowlist test**
- **Found during:** Task 3, running the full `tests/unit/billing/` suite
- **Issue:** `billing-config.test.ts`'s `BILLCFG-03: getBillingConfig consumed ONLY by the reader + credit-ledger` test is a static source-scan guard with an explicit allowlist of legitimate `getBillingConfig` consumers, extended by every prior phase that added one (this exact pattern is documented in both `153-01-SUMMARY.md` and `153-02-SUMMARY.md`'s own deviations). `lib/actions/auto-topup.ts` reads `getBillingConfig()` (for `autoTopupEnabled` and `topUpPacks` range validation) and was correctly NOT on that allowlist yet, so the guard failed as a self-caused regression of this plan's new file.
- **Fix:** Added `lib/actions/auto-topup.ts` to the allowlist with a documenting comment, mirroring every prior phase's addition.
- **Files modified:** `tests/unit/billing/billing-config.test.ts`
- **Verification:** `npx vitest run tests/unit/billing/` — 45/45 files, 349/349 tests green.
- **Committed in:** `037efc69` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs surfaced by this plan's new `lib/actions/auto-topup.ts` file, both fixed before Task 3's commit landed)
**Impact on plan:** No scope creep. Fix 1 is a pure type-narrowing correction (zero behavioral change — the runtime logic was already correct, only the TypeScript inference needed help). Fix 2 is a mechanical allowlist addition with zero behavioral impact.

## Issues Encountered
None beyond the two auto-fixed items above.

**Pre-existing, out-of-scope test failures observed during the full `npm test` run** (unrelated to this plan's files — both explicitly documented as pre-existing in `153-01-SUMMARY.md` and `153-02-SUMMARY.md`'s own runs, and reconfirmed here to fail identically in isolated re-runs untouched by this plan): `tests/integration/blog-rls.test.ts` (2 cases: `getBlogPost returns null for a draft post slug via anon client`, `getBlogPost returns post object for a published post slug via anon client`), `tests/unit/components/landing-page.test.tsx` (1 case: `LandingPage modal auto-open > opens the AuthDialog in login mode when ?auth=login...`). These match the project's documented "Windows parallel-import flakes" pattern and touch no file this plan modified (confirmed via `git log` — neither file has been touched by any 153-* commit). Not fixed — out of scope per the deviation rules' scope boundary.

**Pre-existing `tsc --noEmit` errors** (confirmed unrelated to billing/auto-top-up, all in test files this plan never touched — same set 153-02-SUMMARY.md documented, modulo the two `auto-topup.ts` errors this plan introduced-then-fixed itself): `tests/unit/ai/refine-shared-prompt.test.ts`, `tests/unit/billing/calibration.test.ts`, `tests/unit/billing/seat-billing.test.ts`, `tests/unit/estimate/markup-totals.test.ts`, `tests/unit/estimate/observability.test.ts`, `tests/unit/estimate/step-runner.test.ts`, `tests/unit/inngest/generate-estimate-job.test.ts`, `tests/unit/whatsapp/handler*.test.ts` (missing `chatEnabled` on `Entitlements` fixtures). Not fixed — out of scope, pre-dates this plan.

## Known Stubs
None. Every dollar figure and payment-method label rendered by `AutoTopupCard`/`AutoTopupDialog` is derived from `billing_config.topUpPacks`, the company's own `auto_topup_*` columns, or a live Stripe read — no hardcoded placeholder values, no "coming soon" copy, no unwired data sources. The card is entirely omitted (not stub-rendered) when `billing_config.autoTopupEnabled` is false.

## User Setup Required
None for this plan specifically. `billing_config.autoTopupEnabled` still defaults `false` (set in Plan 02) — auto-top-up (both the trigger core and this plan's tenant-facing UI) ships fully inert until a super admin flips the kill switch on in the admin panel. The migration from Plan 02 (`20260705000002_phase153_auto_topup_columns.sql`) still needs to be applied to remote (CI→GHCR→Coolify, per project convention) before this UI can persist any `auto_topup_*` column — same operational deferral already noted in `153-02-SUMMARY.md`.

## Next Phase Readiness
- The auto-top-up feature (Plans 01-03) is now code-complete: dollar-denominated top-up packs, the concurrency-safe off-session trigger core, and the tenant-facing capture/configure/observe UI all ship inert behind `billing_config.autoTopupEnabled: false`.
- Before enabling in production: apply the Plan 02 migration to remote, flip `autoTopupEnabled` on in the super-admin billing panel, and run a live Stripe test-mode UAT of the full loop (add payment method -> enable auto-top-up -> cross threshold -> confirm exactly one charge -> confirm failure-banner behavior on a declined card).
- No blockers identified for any subsequent phase — this plan's files are additive and do not touch Plan 02's lock/charge logic.

---
*Phase: 153-dollar-pack-top-up-auto-top-up*
*Completed: 2026-07-05*

## Self-Check: PASSED

All created files verified present on disk: `app/api/billing/create-autotopup-setup-session/route.ts`, `lib/actions/auto-topup.ts`, `components/billing/auto-topup-card.tsx`, `components/billing/auto-topup-dialog.tsx`, `tests/unit/billing/autotopup-setup-session.test.ts`, `tests/unit/billing/auto-topup-settings.test.ts`. All modified files verified present: `app/api/webhooks/stripe/route.ts`, `app/(app)/settings/billing/page.tsx`, `tests/unit/billing/stripe-webhook.test.ts`, `tests/unit/billing/billing-config.test.ts`. All 3 task commit hashes verified present in git history: `9631a2e0`, `23a4dc9e`, `037efc69`.
