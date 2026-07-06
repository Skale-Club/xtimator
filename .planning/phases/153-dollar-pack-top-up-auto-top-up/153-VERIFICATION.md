---
phase: 153-dollar-pack-top-up-auto-top-up
verified: 2026-07-05T17:05:00Z
status: passed
score: 14/14 must-haves verified
---

# Phase 153: Dollar-Pack Top-Up + Auto-Top-Up Verification Report

**Phase Goal:** Buying more credits stops being a "how many credits do I want" math problem and becomes a "how many dollars do I want to spend" choice — the tenant picks a configured dollar pack ($20/$50/$100) charged via Stripe and converted to credits using the existing markup, and can optionally set up auto-top-up so they're never surprised by a mid-job low-balance interruption, mirroring the Anthropic Console Auto Top-Up UX.
**Verified:** 2026-07-05T17:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Tenant sees exactly 3 dollar-denominated top-up packs ($20/$50/$100) as the primary label | ✓ VERIFIED | `lib/billing/billing-config.ts` L106-110: `topUpPacks` array has exactly 3 entries at `priceCents` 2000/5000/10000. `TopUpPackCard` renders `${amount}` (from `priceCents/100`) as `CardTitle`, credits as secondary line. |
| 2 | Clicking a pack's CTA starts a real Stripe `mode:'payment'` checkout unchanged from Phase-113 route | ✓ VERIFIED | `create-topup-session/route.ts` untouched; `topup-checkout.test.ts` extended with `packIndex: 2` regression test asserting `unit_amount: 10000`/`credits: '7500'`. |
| 3 | Middle ($50) pack visually marked recommended/"Best value" | ✓ VERIFIED | `topup-packs-grid.tsx` L14: `recommendedIndex = packs.length >= 3 ? 1 : -1`; `TopUpPackCard` renders `Badge` "Best value" when `recommended`. |
| 4 | No dollar amount hardcoded disconnected from `priceCents` | ✓ VERIFIED | `topup-pack-labels-no-hardcode.test.ts` static-source-scan passes; manual read of `topup-pack-card.tsx`/`topup-packs-grid.tsx` confirms all amounts derive from `priceCents/100`. |
| 5 | Platform-wide `autoTopupEnabled` kill switch defaults false, mirrors `enforcementEnabled` pattern | ✓ VERIFIED | `billing-config.ts` L68/L122: type + `DEFAULT_BILLING_CONFIG.autoTopupEnabled: false`, same placement/doc-comment convention as `enforcementEnabled`. |
| 6 | Every existing company defaults to auto-top-up fully off (zero behavior change) | ✓ VERIFIED | Migration `20260705000002_phase153_auto_topup_columns.sql`: all 5 new `companies` columns are nullable or `NOT NULL DEFAULT false`, added via `ADD COLUMN IF NOT EXISTS`. |
| 7 | Two concurrent threshold-crossing debits for the SAME company → exactly ONE off-session Stripe charge | ✓ VERIFIED | `auto-topup-concurrency.test.ts` — dedicated test with call-count-aware RPC mock (first call per companyId wins, rest lose); `Promise.all` of two concurrent `triggerAutoTopupIfNeeded` calls asserts `paymentIntentsCreate` called exactly once. Confirmed passing. |
| 8 | `triggerAutoTopupIfNeeded` never throws under any failure mode | ✓ VERIFIED | `auto-topup.test.ts` covers Stripe decline (sets `auto_topup_last_failed_at`, resolves) and missing-payment-method (resolves, no charge attempted) — both resolve without throwing. Outer function wrapped in try/catch + `console.warn`. |
| 9 | Trigger fires ONLY on tenant's own threshold, never `billing_config.lowBalanceThresholds` | ✓ VERIFIED | `auto-topup.test.ts` "threshold independence" describe block: `newBalance:150` vs tenant threshold `100` does not charge, independent of any `lowBalanceThresholds` value; code (`auto-topup.ts` L84-88) reads only `company.auto_topup_threshold_credits`. |
| 10 | Tenant can start a Stripe-hosted `mode:'setup'` session, no raw card input anywhere | ✓ VERIFIED | `create-autotopup-setup-session/route.ts`: `mode: 'setup'`, no `line_items`. Grep for `type="password"`/`cardNumber`/`card_number` in both new components returns no match. `package.json` has no `stripe-js`/`react-stripe-js` dependency. |
| 11 | Completing setup session attaches payment method via webhook, doesn't fall through to subscription handling | ✓ VERIFIED | `app/api/webhooks/stripe/route.ts` L133-145: new arm positioned between the `credit_topup` arm and the subscription `companyId`/`mode` check, ends in `break`. `stripe-webhook.test.ts` new describe block includes an explicit Pitfall-1 regression test asserting `mockUpdate` (companies-table subscription update) is never called for this event. |
| 12 | Tenant can enable auto-top-up ONLY when platform kill switch on AND payment method exists | ✓ VERIFIED | `lib/actions/auto-topup.ts` `saveAutoTopupSettings`: checks `cfg.autoTopupEnabled` first (short-circuit), then independently calls `stripe.customers.retrieve(...).invoice_settings.default_payment_method` — never trusts a client-supplied boolean. `auto-topup-settings.test.ts` covers both rejection paths. |
| 13 | AutoTopupCard/Dialog render on Settings > Plans mirroring Anthropic Console shape, no hardcoded dollar figures | ✓ VERIFIED | `app/(app)/settings/billing/page.tsx` renders `AutoTopupCard` only when `cfg.autoTopupEnabled`; all pack amounts sourced from `cfg.topUpPacks`; threshold/payment-method label derived from company row + live Stripe read. |
| 14 | Prior auto-top-up failure surfaced with "update payment method" affordance | ✓ VERIFIED | `AutoTopupCard` renders `Alert variant="destructive"` with the exact copy from the UI-SPEC when `lastFailed` is true, sourced from `auto_topup_last_failed_at`. |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/billing/billing-config.ts` | 3 packs @ 2000/5000/10000 + `autoTopupEnabled: false` | ✓ VERIFIED | Confirmed both fields present exactly as specified. |
| `components/billing/topup-pack-card.tsx` | Dollar-first pack card | ✓ VERIFIED | Exports `TopUpPackCard`, wired, no hardcoded literals. |
| `components/billing/topup-packs-grid.tsx` | 3-column grid, `packs` prop | ✓ VERIFIED | Exports `TopUpPacksGrid`, fed by `cfg.topUpPacks`, zero hardcoded pricing. |
| `components/billing/top-up-button.tsx` | Parameterized `label`/`variant` | ✓ VERIFIED | Backward-compatible defaults preserved. |
| `supabase/migrations/20260705000002_phase153_auto_topup_columns.sql` | 5 nullable/false-defaulted columns + 2 RPC functions | ✓ VERIFIED (code) / ⚠ NOT APPLIED (remote) | File present, syntactically consistent, matches plan exactly. **Not yet applied to remote Supabase** — see Operational Note below. |
| `lib/billing/auto-topup.ts` | `triggerAutoTopupIfNeeded`/`acquireAutoTopupLock`/`releaseAutoTopupLock` | ✓ VERIFIED | All three exported, never-throw, fail-closed lock, idempotencyKey as 2nd SDK arg. |
| `app/api/billing/create-autotopup-setup-session/route.ts` | `mode:'setup'` session route | ✓ VERIFIED | Exports `POST`, auth/demo-guard/company-lookup mirrors `create-topup-session`. |
| `lib/actions/auto-topup.ts` | `saveAutoTopupSettings`/`disableAutoTopup` | ✓ VERIFIED | Server-side payment-method + pack-index + threshold guards all present. |
| `components/billing/auto-topup-card.tsx` | Settings > Plans card | ✓ VERIFIED | Exports `AutoTopupCard`, gated behind `cfg.autoTopupEnabled` at the call site. |
| `components/billing/auto-topup-dialog.tsx` | Manage modal | ✓ VERIFIED | Exports `AutoTopupDialogLauncher` + inline dialog; threshold `MoneyInput`, pack `Select`, payment-method setup redirect. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `settings/billing/page.tsx` | `topup-packs-grid.tsx` | `TopUpPacksGrid packs={cfg.topUpPacks}` | ✓ WIRED | Confirmed at L235-238, `#topup-packs` anchor present. |
| `topup-pack-card.tsx` | `top-up-button.tsx` | `TopUpButton packIndex={i} label=... variant=...` | ✓ WIRED | Confirmed. |
| `credit-ledger.ts` | `auto-topup.ts` | `void triggerAutoTopupIfNeeded(...)` directly after `notifyLowCreditBalance` | ✓ WIRED | Confirmed at L157-160, same try block, same fire-and-forget shape. |
| `auto-topup.ts` | migration RPCs | `svc.rpc('acquire_autotopup_lock', ...)` / `release_autotopup_lock` | ✓ WIRED | Confirmed calls match RPC signatures exactly; concurrency test proves atomicity. |
| `auto-topup-dialog.tsx` | `create-autotopup-setup-session` route | `fetch POST` → `window.location.href = data.url` | ✓ WIRED | Confirmed in `PaymentMethodSetupButton`. |
| `webhooks/stripe/route.ts` | `auto-topup.ts` (payment method attach) | `checkout.session.completed` arm, `metadata.type === 'autotopup_setup'` | ✓ WIRED | Confirmed positioned before subscription fall-through; `break` prevents fall-through (Pitfall 1 regression test passes). |
| `auto-topup-dialog.tsx` | `lib/actions/auto-topup.ts` | `saveAutoTopupSettings(formData)` on Save | ✓ WIRED | Confirmed. |
| `settings/billing/page.tsx` | `auto-topup-card.tsx` | `AutoTopupCard` rendered only when `cfg.autoTopupEnabled` | ✓ WIRED | Confirmed gate at L83/L243. |

### Concurrency / Safety Deep-Dive (special scrutiny per verification request)

1. **Atomic lock genuinely proven under concurrency.** `acquire_autotopup_lock` is a single atomic `UPDATE ... WHERE (auto_topup_in_flight_until IS NULL OR < now()) ... GET DIAGNOSTICS ROW_COUNT`, executed inside one Postgres statement — this is race-safe at the DB level (no read-then-write gap). The dedicated test (`auto-topup-concurrency.test.ts`) mocks the RPC with call-count-per-company semantics (first caller wins, rest lose) to simulate the race, then runs two `triggerAutoTopupIfNeeded` calls via `Promise.all` and asserts `paymentIntentsCreate` was called **exactly once**. This is a valid proxy proof for the atomicity property since the real guarantee lives in the single SQL `UPDATE` statement, which is inherently serialized by Postgres — the test correctly proves the *application logic* respects whatever the DB returns, and the DB-level atomicity is structurally sound (single-statement UPDATE, no separate SELECT-then-UPDATE).
2. **Both platform kill switch and tenant opt-in gate the charge path, not just the UI.** `triggerAutoTopupIfNeeded` checks `cfg.autoTopupEnabled` first (returns immediately, confirmed by a test that leaves `companyRow = null` to prove no DB query happens if the platform switch is off), then `company.auto_topup_enabled`. Both checks are in the charge-triggering code path itself (`lib/billing/auto-topup.ts`), not merely in UI rendering conditions — a client bypass cannot cause a charge.
3. **Settings-save re-validates payment method server-side before persisting `enabled:true`.** `saveAutoTopupSettings` calls `stripe.customers.retrieve(..., { expand: ['invoice_settings.default_payment_method'] })` independently and rejects with `{ error }` if `default_payment_method` is falsy — this happens AFTER the kill-switch/threshold/pack-index checks but BEFORE the `companies.update` write, so no code path can persist `auto_topup_enabled: true` without a verified real payment method.
4. **Webhook arm does not fall through into subscription handling.** The new arm is positioned between the `credit_topup` arm's `break` and the subscription `companyId`/`mode` check, and itself ends in `break`. A dedicated regression test in `stripe-webhook.test.ts` asserts the companies-table subscription-mode `update` mock is never invoked for an `autotopup_setup` event.
5. **`idempotencyKey` passed as the Stripe SDK's second argument, not a body field.** Confirmed at `lib/billing/auto-topup.ts` L142-158: the `paymentIntents.create()` call's first argument object ends before `idempotencyKey`, which appears in a separate `{ idempotencyKey: ... }` object as the second argument — consistent with every other Stripe call site in this codebase (`invoice-service.ts`, webhook `grantCredits` calls).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CREDITUI-06 | 153-01 | Tenant purchases credits via dollar-pack choice, converted using existing markup | ✓ SATISFIED | 3-pack grid, unchanged Stripe checkout route, no-hardcode test suite green. |
| CREDITUI-07 | 153-02, 153-03 | Auto-top-up: threshold + pack + payment method, mirrors Anthropic Console | ✓ SATISFIED | Full trigger core (153-02) + capture/configure/observe UI (153-03), concurrency-proven, never-throw, gated by dual kill-switch/opt-in. |

Both requirement IDs declared in PLAN frontmatter (`153-01: [CREDITUI-06]`, `153-02: [CREDITUI-07]`, `153-03: [CREDITUI-07]`) are accounted for. Cross-referenced against `.planning/REQUIREMENTS.md` lines 32-33 and 84-85 — both marked `[x]` complete there, consistent with this verification's findings. No orphaned requirement IDs found (no phase-153-mapped requirement ID exists in REQUIREMENTS.md that isn't claimed by one of the three plans).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODO/FIXME/placeholder/stub markers found in any of the phase's new or modified files | — | None |

Scan covered `lib/billing/auto-topup.ts`, `lib/actions/auto-topup.ts`, `components/billing/auto-topup-card.tsx`, `components/billing/auto-topup-dialog.tsx`, `app/api/billing/create-autotopup-setup-session/route.ts`, `components/billing/topup-pack-card.tsx`, `components/billing/topup-packs-grid.tsx`, `components/billing/top-up-button.tsx`. Clean.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full billing test suite green | `npx vitest run tests/unit/billing/` | 45 files / 349 tests passed | ✓ PASS |
| Billing + webhook suites green together | `npx vitest run tests/unit/billing/ tests/unit/webhooks/` | 47 files / 362 tests passed | ✓ PASS |
| Concurrency test proves exactly-once charge | `npx vitest run tests/unit/billing/auto-topup-concurrency.test.ts` (included in full run above) | Passed — `paymentIntentsCreate` called exactly once under `Promise.all` race | ✓ PASS |
| No Stripe Elements / raw card-input dependency | `grep -n "stripe-js\|react-stripe-js" package.json` | No match | ✓ PASS |
| No raw card-input fields in new UI | `grep -rn "type=\"password\"\|cardNumber\|card_number" components/billing/auto-topup-dialog.tsx components/billing/auto-topup-card.tsx` | No match | ✓ PASS |
| Working tree clean, all task commits present | `git status --short` / `git log` | Clean; commits `ea6872e9`, `a4930e72`, `69b50ef3`, `fa06af7e`, `567cc7b2`, `39fc0122`, `9631a2e0`, `23a4dc9e`, `037efc69` all present | ✓ PASS |

### Human Verification Required

### 1. Live Stripe test-mode UAT of the full auto-top-up loop

**Test:** In Stripe test mode, add a payment method via the setup-session flow, enable auto-top-up with a threshold, drive a company's balance below that threshold, and confirm exactly one real (test-mode) charge fires and credits are granted.
**Expected:** One `payment_intent.succeeded`-equivalent charge, credit balance increases by the configured pack's credit amount, no duplicate charge on repeated debits within the same threshold crossing.
**Why human:** Requires a live Stripe test-mode session, webhook delivery, and real-time balance observation — cannot be verified via static code/test analysis alone.

### 2. Visual/UX review of the pack picker and auto-top-up card against the Anthropic Console reference

**Test:** Visually compare Settings > Plans against the 153-UI-SPEC.md's Anthropic Console mirroring intent (card layout, badge placement, dialog shape, copy tone).
**Expected:** Matches the intended UX mirroring described in the phase goal.
**Why human:** Visual/aesthetic judgment, not programmatically verifiable.

### 3. Admin panel path to actually flip `autoTopupEnabled` to true

**Test:** Confirm how a super-admin is expected to turn the platform kill switch on in production, given the admin billing-config form currently only carries `autoTopupEnabled` through the save payload without an editable checkbox (it's grouped under "Advanced (carried through, no UI this phase)" alongside `meteredOperations`).
**Expected:** Either an explicit decision that flipping this switch is intentionally deferred to a raw metadata edit (consistent with the phased "ships inert" rollout plan documented in both 153-02 and 153-03 SUMMARYs), or confirmation that a follow-up phase/task will add the checkbox.
**Why human:** This is a product/rollout decision, not a code defect — the phase's own SUMMARYs explicitly state the feature "ships fully inert until a super admin flips the kill switch on," implying awareness that this requires an out-of-band action. Not blocking the phase's own must-haves (no plan claimed an admin-UI toggle as an artifact), but worth explicit confirmation before declaring the milestone user-facing-complete.

### Operational Note (non-blocking, per verification instructions)

**The migration `supabase/migrations/20260705000002_phase153_auto_topup_columns.sql` has NOT yet been applied to the remote Supabase database.** This was confirmed as expected: attempting `npx supabase migration list` in this environment returned a 403 (no admin credentials available here), and both 153-02-SUMMARY.md and 153-03-SUMMARY.md explicitly document this as a deferred step, consistent with this project's standard operational pattern (migrations applied via CI→GHCR→Coolify or explicit authorization, not ad-hoc during a GSD phase). **This is not treated as a phase-completion blocker** per the verification brief, but is flagged here as a required pending step before the feature can function against the real database — until applied, any read/write to the new `companies.auto_topup_*` columns or a call to `acquire_autotopup_lock`/`release_autotopup_lock` RPCs would fail against the remote DB (though `triggerAutoTopupIfNeeded` fails closed/never-throws, so this would silently no-op rather than error visibly).

### Gaps Summary

No blocking gaps found. All 14 derived observable truths (from the three plans' `must_haves.truths` frontmatter, covering both CREDITUI-06 and CREDITUI-07) are verified against actual source code, with the full billing + webhook test suite green (362/362 tests) and zero regressions. The concurrency-critical lock, dual kill-switch/opt-in gating, server-side payment-method re-validation, webhook arm non-fall-through, and idempotencyKey placement — all five items flagged for special scrutiny — were independently confirmed correct by direct source reading, not just by trusting the SUMMARY claims.

Two non-blocking items are surfaced for awareness rather than as gaps:
1. The remote migration application is pending (expected, per project convention, explicitly called out in the verification brief as non-blocking).
2. The admin panel has no editable UI checkbox for `autoTopupEnabled` (only pass-through in the save payload) — this was not claimed as an artifact by any of the three plans, so it is not a gap against this phase's own must-haves, but it does mean the platform kill switch can currently only be flipped via a direct database/metadata edit, not through any admin UI. Flagged as a human-verification item rather than a gap.

---

*Verified: 2026-07-05T17:05:00Z*
*Verifier: Claude (gsd-verifier)*
