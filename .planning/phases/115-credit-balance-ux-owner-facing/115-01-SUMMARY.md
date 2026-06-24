---
phase: 115-credit-balance-ux-owner-facing
plan: 01
subsystem: billing
tags: [credits, billing, notifications, owner-ux, server-query]
requires:
  - "lib/billing/billing-config.ts getBillingConfig (Phase 111) — lowBalanceThresholds"
  - "lib/billing/credit-ledger.ts recordCreditDebit (Phase 112) — balance read + debit tail"
  - "lib/notifications/dispatch.ts notify + lib/notifications/copy.ts buildNotificationCopy (Phase 77)"
provides:
  - "lib/queries/credits.ts getCreditOverview(companyId) → { balance, history[], lowBalanceThresholds }"
  - "lib/billing/credit-ledger.ts notifyLowCreditBalance — best-effort low-balance hook wired into recordCreditDebit"
affects:
  - "Plan 115-02 (UI) consumes getCreditOverview"
tech-stack:
  added: []
  patterns:
    - "owner-safe projection via a fixed column-list constant (defense-in-depth)"
    - "downward-threshold-crossing notify mirroring notifyQuotaThresholds (per company/threshold/month dedupe)"
key-files:
  created:
    - "lib/queries/credits.ts"
    - "tests/unit/queries/credits-query.test.ts"
    - "tests/unit/billing/credit-low-notify.test.ts"
  modified:
    - "lib/billing/credit-ledger.ts"
    - "tests/unit/billing/billing-config.test.ts"
decisions:
  - "History projection lists ONLY operation_type/delta_credits/reason/created_at — cost/markup never selected (cardinal rule), proven by a SELECT-string assertion not by hiding"
  - "Reused quota.80pct / quota.exhausted events — no new EventType; copy is informational (enforcement OFF this milestone)"
  - "Local monthKey helper in credit-ledger.ts (not imported from quota.ts) to avoid module coupling"
metrics:
  duration: "~7m"
  completed: "2026-06-24"
  tasks: 3
  commits: 4
  files_created: 3
  files_modified: 2
---

# Phase 115 Plan 01: Credit Balance UX — Data Layer Summary

Owner-facing DATA layer for credit balance UX: `getCreditOverview(companyId)` reads the cached balance + an owner-safe consumption history (cost/markup columns never selected) + the configured low-balance thresholds, and a `notifyLowCreditBalance` hook wired into the end of `recordCreditDebit` fires a best-effort heads-up when a debit drops the balance across a configured threshold. No UI — Plan 02 consumes these.

## What Was Built

- **`lib/queries/credits.ts` (new)** — `import 'server-only'`, `requireServiceClient()`, `Promise.all` of three reads: `companies.credit_balance` (single), `credit_ledger` owner-safe projection (`.select('operation_type, delta_credits, reason, created_at').eq('company_id').order('created_at',desc).limit(50)`), and `getBillingConfig()`. Returns `{ balance: co?.credit_balance ?? 0, history, lowBalanceThresholds }`. Null-safe — missing company row → balance 0, never throws. The projection is a fixed `OWNER_SAFE_LEDGER_COLUMNS` constant so `real_cost_usd`/`markup`/`balance_after`/`idempotency_key`/`ref_id`/`id`/`company_id` are never present in the returned rows (defense-in-depth: rows can be handed to a client component safely).
- **`lib/billing/credit-ledger.ts notifyLowCreditBalance` (new export)** — mirrors `notifyQuotaThresholds`: fires only on a DOWNWARD crossing, deduped per company + threshold + month. Zero/exhausted state (`prev > 0 && new <= 0`) fires `quota.exhausted` (both channels), dedupe `credit-zero-{company}-{month}`. A low non-zero crossing fires `quota.80pct` once for the highest threshold crossed, dedupe `credit-low-{company}-{threshold}-{month}`. `linkUrl: '/settings/billing'`. Whole body in try/catch — never throws.
- **Hook wired into `recordCreditDebit`** — a `void notifyLowCreditBalance({ companyId, userId: null, previousBalance: current, newBalance: balanceAfter, thresholds: cfg.lowBalanceThresholds })` immediately after the existing `companies.credit_balance` update, still inside the existing try. `cfg` was already in scope. Debit math, idempotency check, ledger insert, and balance-update write are byte-unchanged — purely additive at the tail.
- **Two Wave-0 test files** — `credits-query.test.ts` (5: balance read, history mapping, owner-safe-projection SELECT-string guard, thresholds, missing-row default) and `credit-low-notify.test.ts` (4: low downward-crossing fires once with the right dedupe key, zero fires `quota.exhausted`, no-cross is silent, notify-throws is swallowed).

## Cardinal Rules Honored

- **Owner-safe projection** — the `credit_ledger` SELECT is exactly `operation_type, delta_credits, reason, created_at`; `real_cost_usd`/`markup` appear nowhere in the SELECT (test 3 asserts the literal SELECT string contains the four owner-safe columns and `.not.toContain('real_cost_usd')` / `.not.toContain('markup')`). No token math anywhere.
- **Informational copy** — `grep -niE "blocked|denied|cannot" lib/billing/credit-ledger.ts` → 0. Enforcement is OFF; the notification is a heads-up + top-up/upgrade nudge.
- **No new EventType** — reuses `quota.80pct` / `quota.exhausted`; `lib/notifications/event-types.ts` unchanged.
- **No migration, no secrets.** Best-effort hook never breaks the debit write.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Allowlisted lib/queries/credits.ts in the BILLCFG-03 dormancy guard**
- **Found during:** Task 2 verification (overall `tests/unit/queries tests/unit/billing` run)
- **Issue:** The Phase-111 `BILLCFG-03` static guard (`tests/unit/billing/billing-config.test.ts`) asserts that only an explicit allowlist of files reference the `getBillingConfig` symbol. The new `lib/queries/credits.ts` is a legitimate consumer (reads `lowBalanceThresholds`), so the guard turned red — exactly the pre-declared allowlist pattern every prior v4.7 plan applied.
- **Fix:** Added `CREDITS_QUERY_PATH` to the `ALLOWLIST` set with a Phase-115 comment. The guard still fails on any OTHER reference of the symbol — intent preserved.
- **Files modified:** tests/unit/billing/billing-config.test.ts
- **Commit:** cecb2d10

## Verification

- `npx vitest run tests/unit/queries tests/unit/billing` → 27 files / 182 passed.
- FULL `npx vitest run` → 295 files passed | 3 skipped, 2090 passed | 2 skipped | 33 todo. No regressions; the known parallel-only `mcp-route-contract.test.ts` flake did not surface this run.
- `npx tsc --noEmit -p tsconfig.json` → no errors in the two touched/created source files.
- grep proofs: credit_ledger SELECT in `lib/queries/credits.ts` contains neither `real_cost_usd` nor `markup` (those tokens appear only in the doc-comment documenting the exclusion rule); no `blocked`/`denied`/`cannot` in `lib/billing/credit-ledger.ts`; no new EventType.
- All commits normal hooked (gitleaks ran, no `--no-verify`, no leaks; tests use placeholder ids only).

## Commits

- d42c45cd — test(115-01): RED scaffolds for credit overview query + low-balance notify
- e4ce764b — feat(115-01): owner-safe credit overview query
- 6e379312 — feat(115-01): low-balance notification hook in recordCreditDebit
- cecb2d10 — test(115-01): allowlist credits query in BILLCFG-03 dormancy guard

## Self-Check: PASSED

- FOUND: lib/queries/credits.ts
- FOUND: tests/unit/queries/credits-query.test.ts
- FOUND: tests/unit/billing/credit-low-notify.test.ts
- FOUND: notifyLowCreditBalance in lib/billing/credit-ledger.ts
- FOUND commits: d42c45cd, e4ce764b, 6e379312, cecb2d10
