---
phase: 153-dollar-pack-top-up-auto-top-up
plan: 02
subsystem: payments
tags: [stripe, billing-config, concurrency, off-session-charge, postgres-rpc]

# Dependency graph
requires:
  - phase: 153-01
    provides: DEFAULT_BILLING_CONFIG.topUpPacks (3 dollar packs) that auto-top-up purchases from via auto_topup_pack_index
provides:
  - "companies columns: auto_topup_enabled, auto_topup_threshold_credits, auto_topup_pack_index, auto_topup_in_flight_until, auto_topup_last_failed_at (all nullable/false-defaulted)"
  - "acquire_autotopup_lock/release_autotopup_lock atomic Postgres RPC functions (the concurrency-safe lock primitive)"
  - "billing_config.autoTopupEnabled platform-wide kill switch, default false"
  - "lib/billing/auto-topup.ts: triggerAutoTopupIfNeeded/acquireAutoTopupLock/releaseAutoTopupLock — never-throw off-session charge orchestration"
  - "recordCreditDebit now fires triggerAutoTopupIfNeeded on every successful debit"
affects: [153-03-auto-top-up-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic DB-level lock via Postgres RPC (acquire_autotopup_lock/release_autotopup_lock) instead of supabase-js compound .or()/.eq() chaining — sidesteps unverified chaining behavior, fails CLOSED on any RPC error"
    - "Stripe idempotencyKey passed as the SDK's SECOND argument (request options), never as a body field — paymentIntents.create({...}, { idempotencyKey })"
    - "Defense-in-depth concurrency: DB lock (primary, proven by dedicated test) + Stripe idempotencyKey (secondary, guards retried infra calls) — two independent mechanisms, neither alone sufficient"
    - "Never-throw fire-and-forget module mirroring credit-ledger.ts's own shape exactly: try/catch + console.warn, called via `void` from inside recordCreditDebit's hot path"

key-files:
  created:
    - supabase/migrations/20260705000002_phase153_auto_topup_columns.sql
    - lib/billing/auto-topup.ts
    - tests/unit/billing/auto-topup-migration.test.ts
    - tests/unit/billing/auto-topup-concurrency.test.ts
    - tests/unit/billing/auto-topup.test.ts
  modified:
    - lib/billing/billing-config.ts
    - lib/billing/credit-ledger.ts
    - lib/schemas/admin.ts
    - app/admin/integrations/billing-config-form.tsx
    - tests/unit/billing/billing-config.test.ts

key-decisions:
  - "Atomic lock implemented as 2 Postgres RPC functions (acquire_autotopup_lock/release_autotopup_lock) per Research Open Question 1, avoiding unverified supabase-js compound-filter chaining — the UPDATE...WHERE...RETURNING pattern inside plpgsql is the sole source of truth for 'who won the race'"
  - "60-second lock TTL: comfortably longer than any realistic single paymentIntents.create call, while self-healing if a serverless function crashes mid-charge without running a finally block"
  - "chargeAutoTopup implemented in FULL this plan (payment-method resolution + paymentIntents.create + failure recording) rather than stubbed for Plan 03 — Plan 03 only adds the setup-session route that populates the payment method this function reads, it does not re-open this function"
  - "Idempotency key uses Date.now() scoped to a single triggerAutoTopupIfNeeded invocation — acceptable per research's 'complementing, not replacing' guidance since the DB lock (not the Stripe key) is the primary defense proven by the dedicated concurrency test"
  - "autoTopupEnabled added to both DEFAULT_BILLING_CONFIG AND billingConfigSchema (the plan's interface spec only mentioned the config type/default; the schema addition was a self-caught Rule 1 fix — see Deviations)"

requirements-completed: [CREDITUI-07]

# Metrics
duration: 20min
completed: 2026-07-05
---

# Phase 153 Plan 02: Auto-Top-Up Safety Foundation Summary

**Built the concurrency-safe off-session auto-top-up trigger core: 5 new nullable/false-defaulted `companies` columns, an atomic Postgres-RPC in-flight lock, the platform-wide `autoTopupEnabled` kill switch, and `lib/billing/auto-topup.ts`'s never-throw `triggerAutoTopupIfNeeded` — proven by a dedicated concurrency test to fire exactly one Stripe charge when two debits race the same company's threshold crossing.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-05T20:04:00Z (approx)
- **Completed:** 2026-07-05T20:22:00Z (approx)
- **Tasks:** 3
- **Files modified:** 5 modified, 5 created

## Accomplishments
- New migration `20260705000002_phase153_auto_topup_columns.sql` adds `auto_topup_enabled` (`NOT NULL DEFAULT false`), `auto_topup_threshold_credits`, `auto_topup_pack_index`, `auto_topup_in_flight_until`, `auto_topup_last_failed_at` (all nullable, `DEFAULT NULL`) to `companies` — every existing company keeps auto-top-up fully off, zero behavior change.
- Same migration defines `acquire_autotopup_lock(p_company_id, p_ttl_seconds)` and `release_autotopup_lock(p_company_id)` — atomic plpgsql `UPDATE ... WHERE ... GET DIAGNOSTICS ROW_COUNT` functions that let exactly one concurrent caller win the lock, failing CLOSED on ambiguity.
- `billing_config.autoTopupEnabled` platform-wide kill switch added, defaulting `false`, mirroring `enforcementEnabled`'s exact pattern (type, default, and now also the zod schema — see Deviations).
- `lib/billing/auto-topup.ts` (new): `acquireAutoTopupLock`/`releaseAutoTopupLock` wrap the RPCs (fail closed on any error); `triggerAutoTopupIfNeeded` is the never-throw public orchestrator (platform kill switch -> tenant opt-in -> tenant's own threshold -> payment method presence -> lock acquisition -> charge -> lock release in a `finally`); `chargeAutoTopup` (not exported) resolves the saved default payment method via `stripe.customers.retrieve(..., { expand: ['invoice_settings.default_payment_method'] })` and calls `paymentIntents.create` off-session with `idempotencyKey` as the SDK's second argument.
- `credit-ledger.ts`'s `recordCreditDebit` now fires `void triggerAutoTopupIfNeeded({companyId, newBalance: balanceAfter})` directly after the existing `notifyLowCreditBalance` call — same fire-and-forget shape, zero other behavior change.
- Dedicated concurrency test (`auto-topup-concurrency.test.ts`) proves the single riskiest property in this phase: two `triggerAutoTopupIfNeeded` calls racing via `Promise.all` for the same company result in `paymentIntents.create` being called EXACTLY ONCE.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration for auto-top-up companies columns + lock RPC functions, autoTopupEnabled kill switch** - `fa06af7e` (feat)
2. **Task 2: Build the atomic in-flight lock helpers with a dedicated concurrency test** - `567cc7b2` (feat)
3. **Task 3: Trigger logic tests (threshold independence, never-throw) and wire the credit-ledger call site** - `39fc0122` (feat)

_TDD flow: each task's test file was written alongside its implementation and run to green before committing; Task 2's concurrency test is the load-bearing proof of the phase's riskiest correctness property._

## Files Created/Modified
- `supabase/migrations/20260705000002_phase153_auto_topup_columns.sql` (new) - 5 nullable/false-defaulted `companies` columns + `acquire_autotopup_lock`/`release_autotopup_lock` RPC functions
- `lib/billing/billing-config.ts` - added `autoTopupEnabled: boolean` to the `BillingConfig` type + `DEFAULT_BILLING_CONFIG` (default `false`)
- `lib/billing/auto-topup.ts` (new) - `acquireAutoTopupLock`, `releaseAutoTopupLock`, `triggerAutoTopupIfNeeded` (exported); `chargeAutoTopup` (internal)
- `lib/billing/credit-ledger.ts` - imports `triggerAutoTopupIfNeeded`; `recordCreditDebit` fires it directly after `notifyLowCreditBalance`
- `tests/unit/billing/auto-topup-migration.test.ts` (new) - static-SQL-read contract for the 5 columns + 2 RPC functions
- `tests/unit/billing/auto-topup-concurrency.test.ts` (new) - the dedicated riskiest-test-in-the-phase: lock acquire/release semantics + the exactly-once-charge proof under concurrency
- `tests/unit/billing/auto-topup.test.ts` (new) - threshold independence, platform kill switch, tenant opt-out, never-throw (Stripe decline / no payment method), and the `credit-ledger.ts` wiring proof
- `tests/unit/billing/billing-config.test.ts` - new `CREDITUI-07: autoTopupEnabled kill switch` describe block (3 tests); `lib/billing/auto-topup.ts` added to the pre-existing `BILLCFG-03` dormancy-guard allowlist (see Deviations)
- `lib/schemas/admin.ts` - added `autoTopupEnabled: z.boolean()` to `billingConfigSchema` (see Deviations)
- `app/admin/integrations/billing-config-form.tsx` - `autoTopupEnabled: current.autoTopupEnabled` added to the save payload, carried through unchanged (Plan 03 adds the editable toggle)

## Decisions Made
- Atomic lock via 2 Postgres RPC functions (not supabase-js `.or()`/`.eq()` chaining) per the research's Open Question 1 resolution — the plpgsql `UPDATE...WHERE (in_flight IS NULL OR in_flight < now())` + `GET DIAGNOSTICS ROW_COUNT` is the sole source-of-truth for "who won the race," verified directly by the concurrency test's RPC-call-count mock.
- 60-second lock TTL as a self-healing backstop — long enough for any realistic Stripe call, short enough that a crashed serverless function doesn't permanently wedge a company's auto-top-up.
- `chargeAutoTopup` implements the FULL off-session charge attempt in this plan (payment-method resolution, `paymentIntents.create`, success/failure `auto_topup_last_failed_at` bookkeeping) rather than being a stub — Plan 03 only needs to add the setup-session route that populates the saved payment method this function already reads.
- Idempotency key (`autotopup:{companyId}:${Date.now()}`) is scoped to a single invocation, not retried within the function body — the DB lock is the primary/necessary defense (proven by Test 4's concurrency proof); Stripe's key is defense-in-depth for the separate case of a retried infrastructure-level Stripe API call.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `autoTopupEnabled` silently stripped by `billingConfigSchema.safeParse`, breaking the admin save round-trip**
- **Found during:** Task 3, running the full `npm test` suite before considering the plan complete (as the plan's overall verification step instructed)
- **Issue:** The plan's interface spec only described adding `autoTopupEnabled` to the `BillingConfig` TypeScript type and `DEFAULT_BILLING_CONFIG` — it did not mention `lib/schemas/admin.ts`'s `billingConfigSchema` (the zod validator `saveBillingConfig()` parses every admin-panel save through). Since zod strips unrecognized keys by default, `autoTopupEnabled` was silently dropped on every admin save, breaking `tests/unit/admin/billing-config-save.test.ts`'s round-trip assertion (`upsertPayload.metadata` no longer equaled `DEFAULT_BILLING_CONFIG`) and — more importantly — meaning the kill switch could never actually be persisted from the admin panel once Plan 03 wires an editable toggle to it.
- **Fix:** Added `autoTopupEnabled: z.boolean()` to `billingConfigSchema`, mirroring the existing `enforcementEnabled: z.boolean()` field placement/pattern.
- **Files modified:** `lib/schemas/admin.ts`
- **Verification:** `npx vitest run tests/unit/admin/billing-config-save.test.ts` green (5/5); full `npm test` re-run confirmed no other regression.
- **Committed in:** `39fc0122` (Task 3 commit)

**2. [Rule 1 - Bug] `autoTopupEnabled` missing from the admin billing-config form's save payload, breaking `tsc --noEmit`**
- **Found during:** Task 3, running `npx tsc --noEmit` as part of pre-commit verification
- **Issue:** `app/admin/integrations/billing-config-form.tsx`'s `handleSave()` assembles a `payload: BillingConfig` object literal that must satisfy the full `BillingConfig` type. Adding `autoTopupEnabled` to that type (Task 1) made this pre-existing object literal fail to type-check (`TS2741: Property 'autoTopupEnabled' is missing`).
- **Fix:** Added `autoTopupEnabled: current.autoTopupEnabled` to the payload, carried through unchanged (identical pattern to `meteredOperations`/`absorbedChatRateLimitPerMin`, which are also not yet editable in this panel) — the editable toggle UI is explicitly Plan 03's scope.
- **Files modified:** `app/admin/integrations/billing-config-form.tsx`
- **Verification:** `npx tsc --noEmit` — this specific error resolved (confirmed by before/after diff of the full tsc output); no new errors introduced.
- **Committed in:** `39fc0122` (Task 3 commit)

**3. [Rule 1 - Bug] `lib/billing/auto-topup.ts` tripped the pre-existing `BILLCFG-03` dormancy-guard allowlist test**
- **Found during:** Task 3, running the full `tests/unit/billing/` suite
- **Issue:** `billing-config.test.ts`'s `BILLCFG-03: getBillingConfig consumed ONLY by the reader + credit-ledger` test is a static source-scan guard with an explicit allowlist of legitimate `getBillingConfig` consumers (extended by every prior phase that added one). `lib/billing/auto-topup.ts` reads `getBillingConfig()` (for `autoTopupEnabled` and `topUpPacks`) and was correctly NOT on that allowlist yet, so the guard failed as a self-caused regression of this plan's new file — exactly the same pattern documented in the 153-01-SUMMARY.md deviations.
- **Fix:** Added `lib/billing/auto-topup.ts` to the allowlist with a documenting comment, mirroring every prior phase's addition (Stripe webhook, topup-session route, seat-billing, etc.).
- **Files modified:** `tests/unit/billing/billing-config.test.ts`
- **Verification:** `npx vitest run tests/unit/billing/` — 43/43 files, 335/335 tests green.
- **Committed in:** `39fc0122` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs surfaced by adding a new `BillingConfig` field and a new legitimate consumer, all fixed before Task 3's commit landed)
**Impact on plan:** No scope creep. Fix 1 is load-bearing (without it the kill switch could never persist from the admin panel); Fixes 2-3 are mechanical type/allowlist updates with zero behavioral impact on the auto-top-up logic itself.

## Issues Encountered
None beyond the three auto-fixed items above.

**Pre-existing, out-of-scope test failures observed during the full `npm test` run** (unrelated to this plan's files — both explicitly documented as pre-existing in `153-01-SUMMARY.md`'s own `npm test` run): `tests/integration/blog-rls.test.ts` (2 cases), `tests/unit/components/landing-page.test.tsx`. These match the project's documented "Windows parallel-import flakes that pass in isolation" pattern and touch no file this plan modified. Not fixed — out of scope per the deviation rules' scope boundary.

**Pre-existing `tsc --noEmit` errors** (confirmed identical before and after this plan's changes via a `git stash` diff, all in test files unrelated to billing/auto-top-up): `tests/unit/ai/refine-shared-prompt.test.ts`, `tests/unit/billing/calibration.test.ts`, `tests/unit/billing/seat-billing.test.ts`, `tests/unit/estimate/markup-totals.test.ts`, `tests/unit/estimate/observability.test.ts`, `tests/unit/estimate/step-runner.test.ts`, `tests/unit/inngest/generate-estimate-job.test.ts`, `tests/unit/whatsapp/handler*.test.ts` (missing `chatEnabled` on `Entitlements` fixtures). Not fixed — out of scope, pre-dates this plan.

## Known Stubs
None. `triggerAutoTopupIfNeeded` implements the full trigger -> lock -> charge -> release flow (not a stub awaiting Plan 03); the only piece Plan 03 adds is the settings UI + setup-session route that lets a tenant actually configure `auto_topup_enabled`/`auto_topup_threshold_credits`/`auto_topup_pack_index` and attach a saved payment method — this plan's code already reads those columns correctly and no-ops safely while they're unset (every existing company today).

## User Setup Required
None for this plan specifically. The migration has not yet been applied to remote (deploy via CI->GHCR->Coolify per project convention — same operational deferral pattern as every prior phase). `billing_config.autoTopupEnabled` defaults `false` and every company's own `auto_topup_enabled` defaults `false`, so this plan ships fully inert until Plan 03's UI + an explicit admin/tenant opt-in flip both switches on.

## Next Phase Readiness
- `lib/billing/auto-topup.ts`'s `triggerAutoTopupIfNeeded`/`acquireAutoTopupLock`/`releaseAutoTopupLock` exports are stable and ready for Plan 03 to build on top of (settings UI reading/writing the new `companies` columns, and a setup-session route populating the Stripe default payment method that `chargeAutoTopup` already reads).
- `billing_config.autoTopupEnabled` is now both a `BillingConfig` field AND a `billingConfigSchema` field — Plan 03's admin-panel toggle can bind directly to it without any further schema work.
- No blockers identified for Plan 03: this plan's files (`lib/billing/auto-topup.ts`, the migration, `credit-ledger.ts`'s one new call-site line) are additive and disjoint from the settings-UI/setup-session-route files Plan 03 will create.

---
*Phase: 153-dollar-pack-top-up-auto-top-up*
*Completed: 2026-07-05*

## Self-Check: PASSED

All created files verified present on disk: `supabase/migrations/20260705000002_phase153_auto_topup_columns.sql`, `lib/billing/auto-topup.ts`, `tests/unit/billing/auto-topup-migration.test.ts`, `tests/unit/billing/auto-topup-concurrency.test.ts`, `tests/unit/billing/auto-topup.test.ts`. All modified files verified present: `lib/billing/billing-config.ts`, `lib/billing/credit-ledger.ts`, `lib/schemas/admin.ts`, `app/admin/integrations/billing-config-form.tsx`, `tests/unit/billing/billing-config.test.ts`. All 3 task commit hashes verified present in git history: `fa06af7e`, `567cc7b2`, `39fc0122`.
