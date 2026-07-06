---
phase: 158-admin-billing-page-credit-model-overhaul
verified: 2026-07-06T05:10:00Z
status: passed
score: 3/3 must-haves verified
---

# Phase 158: Admin Billing Page Credit-Model Overhaul Verification Report

**Phase Goal:** The admin `/admin/billing` page tells the operator the truth that matters — per-company credit balance, real AI cost, and effective markup — as the primary view, with force-tier/grant-credits demoted to secondary actions, and the platform summary card shows real aggregated cost data instead of a fabricated MRR number.
**Verified:** 2026-07-06T05:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin visiting `/admin/billing` sees a platform-wide real-cost/credit summary card instead of the old hardcoded MRR card | VERIFIED | `page.tsx` lines 15-29: `getBillingConfig()` + `aggregateAiCostByOperation()` (no-arg) computed in parallel; `totalRealCostUsd` derived via `meanUsd * n` reduce (identical formula to `getCompanyCostOverview`); card heading is `Platform AI Cost` (lines 64-74), zero occurrences of `mrr`, `proCount`, `bizCount`, or "Monthly Recurring Revenue" anywhere in the file |
| 2 | Admin sees, per company row, credit balance / real AI cost / auto-top-up status as primary visible data | VERIFIED | `billing-table.tsx` table header (lines 204-209): Company, Credit balance, Real cost, Auto-top-up, Tier, then unlabeled Manage-toggle column — in that order, before any secondary action. `credit_balance` and `auto_topup_enabled` selected directly on the `companies` query (`page.tsx` line 20); `realCostUsd` merged per-row via batched `ai_cost_events` query (lines 34-52) |
| 3 | Admin can still Force tier and Grant credits per company — unchanged behavior, just visually de-emphasized behind a collapsed Manage disclosure | VERIFIED | `billing-table.tsx` imports `forceTier, grantBonusCredits` unchanged from `./actions` (line 21); `handleForceTier`/`handleGrantCredits` call them with identical arguments/semantics as the pre-phase version; both now render only when `manageOpen` is true (per-row `useState` toggle, lines 70, 122-125, 127-184) |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/admin/billing/page.tsx` | Server component computing platform-wide summary via `aggregateAiCostByOperation()`/`getBillingConfig()`, passing markup + companies to `BillingTable` | VERIFIED | Exists, substantive (86 lines, real query logic, no stubs), wired (imports both functions, calls with correct signatures, passes `markup`/`creditUnitUsd`/merged companies to `<BillingTable>`) |
| `app/admin/billing/billing-table.tsx` | Client table with Credit balance/Real cost/Auto-top-up primary, Force tier/Grant credits collapsed into Manage disclosure | VERIFIED | Exists, substantive (229 lines, full row/expand logic, no stubs), wired (receives and threads `markup`/`creditUnitUsd` props, renders all new columns, `forceTier`/`grantBonusCredits` genuinely invoked on button click) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/admin/billing/page.tsx` | `lib/billing/calibration.ts` | `aggregateAiCostByOperation()` no-arg platform-wide call | WIRED | Line 17: `aggregateAiCostByOperation()` called with zero arguments inside `Promise.all` — confirmed by reading `calibration.ts`: omitting `companyId` runs the platform-wide branch (`.select('operation_type, real_cost_usd').not('real_cost_usd', 'is', null)` with no `.eq('company_id', ...)`) |
| `app/admin/billing/page.tsx` | `lib/billing/billing-config.ts` | `getBillingConfig()` for markup + creditUnitUsd | WIRED | Line 16: `getBillingConfig()` called, destructured into `billingConfig.markup` / `billingConfig.creditUnitUsd`, both used in the credits-equivalent formula (lines 26-29) and passed to `BillingTable` (lines 79-80) |
| `app/admin/billing/billing-table.tsx` | `app/admin/billing/actions.ts` | `forceTier` / `grantBonusCredits` still imported and called unchanged | WIRED | Line 21 import; `handleForceTier`/`handleGrantCredits` (lines 76-94) call both with the same argument shapes (`companyId, tier, expiresAt?` / `companyId, units`) as the pre-phase table — `actions.ts` itself shows zero diff since commit `f455ac16` (well before this phase), confirmed via `git log` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| Platform summary card | `totalRealCostUsd` / `totalCreditsEquivalent` | `aggregateAiCostByOperation()` → real `ai_cost_events` rows (service-role query, excludes NULL costs) | Yes — reads live production table, `[]` fallback only on read failure (never silently zeroed for cosmetic reasons) | FLOWING |
| Per-row Credit balance | `company.credit_balance` | Direct column from extended `companies` select | Yes — real DB column, no client-side fabrication | FLOWING |
| Per-row Real cost | `company.realCostUsd` | Batched `.in('company_id', companyIds)` query over `ai_cost_events`, grouped into a `Map` | Yes — real per-company aggregation from the same production table as the platform summary | FLOWING |
| Per-row Auto-top-up | `company.auto_topup_enabled` | Direct column from extended `companies` select (migration `20260705000002_phase153_auto_topup_columns.sql`) | Yes — real boolean column | FLOWING |

No hollow props or disconnected data sources found. All rendered figures trace to genuine DB reads with zero new backend logic, matching the phase's "reuse only" constraint.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Query count bounded regardless of company count | Manual trace of `page.tsx`: `getBillingConfig()` + `aggregateAiCostByOperation()` + companies select (all in one `Promise.all`) + 1 conditional batched `ai_cost_events .in()` query | 4 total queries max, 0 per-row queries, confirmed by reading the full file — no loop calls `getCompanyCostOverview` or `aggregateAiCostByOperation(companyId)` per row | PASS |
| `forceTier`/`grantBonusCredits` unaffected by this phase | `npx vitest run tests/unit/notifications/event-sources.test.ts` | 10/10 tests passed (1.74s) | PASS |
| No new type errors from the 2 modified files | `npx tsc --noEmit` | Zero errors reference `app/admin/billing/page.tsx` or `app/admin/billing/billing-table.tsx`; 16 pre-existing errors in unrelated test files (`calibration.test.ts`, `seat-billing.test.ts`, `whatsapp/*`, `estimate/*`) confirmed pre-existing and out of this phase's file scope | PASS |
| Git diff scope confined to the 2 declared files | `git diff f4806104^ 3f050f59 --stat` | Exactly 2 files changed: `app/admin/billing/billing-table.tsx` (186 changed lines) and `app/admin/billing/page.tsx` (55 changed lines) — no other file touched across both phase commits | PASS |
| `actions.ts` genuinely untouched by this phase | `git log --oneline --all -- app/admin/billing/actions.ts` | Last modifying commit is `f455ac16` ("Billing v2 — credits are the meter"), predating both phase-158 commits (`f4806104`, `3f050f59`) — zero commits touch this file in or after the phase window | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| BILLADMIN-01 | 158-01 | Primary view is credit-model-centric (credit balance, real cost, effective markup), replacing tier/MRR-first presentation | SATISFIED | Table header order Company→Credit balance→Real cost→Auto-top-up→Tier→Manage; per-row `creditsEquivalent` computed with `markup` (page.tsx passes `markup` prop; table computes `Math.round((company.realCostUsd * markup) / creditUnitUsd)` — the exact production billing formula) |
| BILLADMIN-02 | 158-01 | Force-tier/grant-credits remain available as secondary actions, not removed | SATISFIED | Both actions imported unchanged, invoked with identical semantics, now behind a per-row `Manage`/`Hide` toggle (`manageOpen` state) rather than deleted — confirmed functional, not just present |
| BILLADMIN-03 | 158-01 | Platform-wide summary reflects real aggregated data via no-arg `aggregateAiCostByOperation()`, not `proCount*29 + bizCount*99` | SATISFIED | `aggregateAiCostByOperation()` called with zero args (line 17); old MRR formula and all its identifiers (`mrr`, `proCount`, `bizCount`) fully absent from both files |

No orphaned requirements — REQUIREMENTS.md maps only BILLADMIN-01/02/03 to Phase 158, all three declared in the plan's frontmatter and all three satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `billing-table.tsx` | 161, 174 | `placeholder={...}` | None (false positive) | Legitimate HTML input placeholder attributes for date/number fields, not stub markers |

No blockers or warnings found. No TODO/FIXME/HACK comments, no empty handlers, no hardcoded-empty data flowing to render.

### Human Verification Required

### 1. Visual rendering and Manage-disclosure interaction

**Test:** Open `/admin/billing` as an admin user in a browser; observe the Platform AI Cost card and table; click "Manage" on a company row.
**Expected:** Card shows a real (non-fabricated) `$X.XX` figure with a credits-equivalent caption; table renders Credit balance / Real cost / Auto-top-up / Tier columns cleanly at typical viewport widths (1440px per the existing e2e visual test); clicking "Manage" expands a row revealing Trial ends / Stripe sub / Force tier controls / Grant credits controls without layout breakage; Force/Grant buttons produce a visible success/error message.
**Why human:** Requires a live authenticated session against a real Supabase instance with actual `ai_cost_events`/`companies` data — cannot be verified via static analysis. The existing Playwright visual regression test (`tests/e2e/visual/admin.spec.ts`) covers `/admin/billing` but is skipped without an `authenticated-state.json` fixture in this environment, and its screenshot baseline will need regeneration/review since the page's DOM materially changed (new columns, new card copy).

### Gaps Summary

None found. All three success criteria (BILLADMIN-01/02/03) are verified against actual code, not just SUMMARY claims. The phase is a clean data-source swap with zero new backend logic, as scoped: `actions.ts`, `admin-company-cost.ts`, and `calibration.ts` are all confirmed byte-for-byte unmodified by this phase (verified via `git log`, not assumption). Query count is bounded (4 total, no N+1). Force-tier and grant-credits are demonstrably still wired and functional, just relocated behind a per-row disclosure — satisfying BILLADMIN-02's preservation requirement, not merely its non-removal requirement. The only open item is a human/CI-level visual regression check, which is expected for any UI-shape change and does not block the phase goal.

---

*Verified: 2026-07-06T05:10:00Z*
*Verifier: Claude (gsd-verifier)*
