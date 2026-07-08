---
phase: 161-presentation-settings-data-model-persistence
verified: 2026-07-08T00:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: null
---

# Phase 161: Presentation Settings Data Model & Persistence — Verification Report

**Phase Goal:** Deliver the one persisted data model and one pure resolver for per-estimate presentation & pricing-override state (visibility + tax/discount/deposit overrides), plus the plumbing that threads it end-to-end through the read type, write action, and editor reducer — ready for Phase 162's UI and Phase 163's cross-renderer rollout, with GUARD-03 (presentation state cannot cascade into totals math) enforced structurally at every seam.

**Verified:** 2026-07-08
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every estimate has a resolvable `presentation_settings` value; NULL/absent resolves to all-7-sections-visible + no overrides (PRESENT-01) | VERIFIED | `supabase/migrations/20260708000002_phase161_presentation_settings.sql` adds JSONB column; `lib/estimate/presentation-settings.ts:68-76` defines `DEFAULT_SECTION_VISIBILITY` with all 7 keys `true`; `resolvePresentationSettings(null/undefined)` degrades to defaults (unit tests 1-2 green) |
| 2 | The resolver never reads or writes content fields — hiding is provably non-destructive by data-shape separation (PRESENT-02) | VERIFIED | `lib/estimate/presentation-settings.ts:89-108` — resolver operates only on `PresentationSettings` shape (sections/tax/discount/deposit), never touches summary/notes/timeline/etc.; unit test `non-destructive hiding proof` + `round-trip` both green |
| 3 | An estimate can express Tax Default/Custom/Off (Off preserves original rate), Discount override, and Deposit override state independent of company defaults (PRESENT-03) | VERIFIED | `TaxOverride` (line 30-36) with `mode: 'default' \| 'custom' \| 'off'` + `preservedRate`; `DiscountOverride`/`DepositOverride` (lines 38-48) with `enabled/type/value`; unit test `tax override mode "off" preserves preservedRate...` green (verifies preservedRate survives mode flips) |
| 4 | `resolvePresentationSettings` + `isSectionVisible` (+ `hasEstimateBeenSentOrViewed`) are the ONLY exported visibility predicates — no ad hoc second predicate (PRESENT-04) | VERIFIED | `grep -c "export function" lib/estimate/presentation-settings.ts` = 3; structural export-shape unit test iterates `Object.keys(...).filter(typeof === 'function')` and asserts the exact set |
| 5 | `hasEstimateBeenSentOrViewed` derives sent/viewed state from existing `sent_at`/`viewed_at`, no new tracking (PRESENT-05) | VERIFIED | `lib/estimate/presentation-settings.ts:116-121` — pure boolean derivation from denormalized columns; 3 unit tests cover both fields and both-null case; UI notice rendering deferred to Phase 162 per plan scope (documented in resolver JSDoc line 111-114) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260708000002_phase161_presentation_settings.sql` | Dormant-first JSONB column | VERIFIED | 23-line file, `ADD COLUMN IF NOT EXISTS presentation_settings JSONB` present (grep = 1), documenting `COMMENT ON COLUMN`, header notes "Authored-only", no `CREATE INDEX` (matches `companies.tax_config` precedent) |
| `lib/estimate/presentation-settings.ts` | Pure resolver module | VERIFIED | 129 lines; exports exactly `resolvePresentationSettings`, `isSectionVisible`, `hasEstimateBeenSentOrViewed`; zero `compute-totals` refs; zero `'use server'`; zero `@supabase` imports |
| `tests/unit/estimate/presentation-settings.test.ts` | Unit coverage PRESENT-01..05 + GUARD-03 | VERIFIED | 1 `describe`, 13 `it` blocks; 13/13 green; includes GUARD-03 static-file-read assertion (`expect(source).not.toContain('compute-totals')`) |
| `lib/queries/estimate.ts` | Typed `presentation_settings` on Estimate | VERIFIED | Line 57: `presentation_settings: PresentationSettings \| null`; line 4: `import type { PresentationSettings } from '@/lib/estimate/presentation-settings'`; `.select('*')` count = 3 (unchanged) |
| `lib/actions/estimate.ts` | Pass-through `SaveEstimateInput` field + UPDATE payload | VERIFIED | Line 90: `presentation_settings?: PresentationSettings \| null`; line 202: `presentation_settings: estimateData.presentation_settings ?? null,` inside `.update({...})`; `computeEstimateTotals(` count = 1 (byte-unchanged call site) |
| `components/workspace/estimate/use-estimate-reducer.ts` | State field + UPDATE_PRESENTATION_SETTINGS action + reducer case + initState wiring | VERIFIED | Line 71 state field; line 99 action-union member; lines 465-466 reducer case (pure state merge, no `recalculate()`); line 204 no-estimate initState branch; line 238 server-row cast-with-fallback branch |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| tests → resolver | `lib/estimate/presentation-settings.ts` | `import ... from '@/lib/estimate/presentation-settings'` | WIRED | Lines 3-8 of test file import all three functions + namespace |
| resolver → compute-totals | `lib/estimate/compute-totals.ts` | MUST NOT import (GUARD-03) | WIRED (correctly NOT imported) | `grep -c "compute-totals" lib/estimate/presentation-settings.ts` = **0** |
| queries → resolver types | `lib/estimate/presentation-settings.ts` | `import type { PresentationSettings }` | WIRED | Line 4 of `lib/queries/estimate.ts` |
| actions → resolver types | `lib/estimate/presentation-settings.ts` | `import type { PresentationSettings }` + pass-through UPDATE payload | WIRED | Line 13 import; line 202 UPDATE payload; NOT read by `computeEstimateTotals(...)` call at line 125 (input object is deposit-only) |
| reducer → resolver types | `lib/estimate/presentation-settings.ts` | `import type`; UPDATE_PRESENTATION_SETTINGS action + case | WIRED | Line 7 import; line 99 action union; line 465-466 reducer case; `recalculate(` NOT present in the case body |

### Data-Flow Trace (Level 4)

Skipped for this phase — pure plumbing with no UI rendering surface. Dynamic-data verification lands in Phase 162 (UI binds to `UPDATE_PRESENTATION_SETTINGS`) and Phase 163 (renderers consume `resolvePresentationSettings`). Level 4 here reduces to type-flow tracing, which the tsc pass covers.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Resolver + guards unit tests | `npx vitest run tests/unit/estimate/presentation-settings.test.ts tests/unit/estimate/compute-totals-guards.test.ts` | 2 files, **21/21 passing** (13 resolver + 8 guards), 2.24s | PASS |
| TypeScript typecheck | `npx tsc --noEmit` | 22 errors total, **0 in any Phase 161 file** (all errors are pre-existing tech-debt in billing/chat/observability/whatsapp/inngest/step-runner/markup-totals tests — unrelated to this phase) | PASS (scoped to Phase 161) |
| GUARD-03 static boundary | `grep -c "compute-totals" lib/estimate/presentation-settings.ts` | 0 | PASS |
| GUARD-03 reducer boundary | `grep -A2 "case 'UPDATE_PRESENTATION_SETTINGS':" components/workspace/estimate/use-estimate-reducer.ts` | 2-line body: `{ ...state, presentation_settings: action.presentation_settings, isDirty: true }` — **no `recalculate(`** | PASS |
| `computeEstimateTotals(` call byte-unchanged | `grep -c "computeEstimateTotals(" lib/actions/estimate.ts` | 1 (only the real call site at line 125) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PRESENT-01 | 161-01, 161-02 | Persisted `presentation_settings` record (dormant-first JSONB, NULL = today's behavior) covering visibility of 7 sections | SATISFIED | Migration adds JSONB column; resolver defaults NULL/absent → all 7 sections `true`; Estimate query type surfaces the field; SaveEstimateInput accepts it; UPDATE payload persists it; reducer holds it |
| PRESENT-02 | 161-01 | Toggling a section off never deletes/clears content | SATISFIED | Non-destructive-by-shape: resolver operates on `settings.sections[key]`, never on content columns (summary/notes/etc.). Unit tests `non-destructive hiding proof` + `round-trip` prove content is untouched and state round-trips through JSON without loss |
| PRESENT-03 | 161-01, 161-02 | Tax Default/Custom/Off + Discount + Deposit overrides scoped to the estimate | SATISFIED | `TaxOverride`/`DiscountOverride`/`DepositOverride` interfaces in resolver; `preservedRate` distinct from `customRate` proven by unit tests; reducer's `UPDATE_PRESENTATION_SETTINGS` action + case allow mutating this state without triggering totals math (GUARD-03 preserved) |
| PRESENT-04 | 161-01 | Single resolver module — no renderer re-implements visibility | SATISFIED at the domain layer | `lib/estimate/presentation-settings.ts` is the single module; structural export-shape unit test asserts exactly the 3 functions. **Note:** wiring renderers to consume this resolver is Phase 163 (per plan scope + SUMMARY note). |
| PRESENT-05 | 161-01 | Sent/viewed derivation with no new tracking infrastructure | SATISFIED at the signal layer | `hasEstimateBeenSentOrViewed({sent_at, viewed_at})` predicate exists, reuses existing denormalized columns, 3 unit tests cover both fields + both-null case. **Note:** the UI notice rendering (inline banner) lands in Phase 162 per the resolver's own JSDoc comment (line 111-114). This is a deliberate scope split, consistent with the phase's "data model + resolver + plumbing" charter. |

**No orphaned requirements.** All 5 PRESENT-XX IDs mapped to Phase 161 in REQUIREMENTS.md are accounted for by a Phase 161 plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | (none found) | — | Resolver has no TODO/FIXME/placeholder/empty-return; no hardcoded stubs; reducer case is a clean state-merge |

### Human Verification Required

None. Phase 161 is pure plumbing — no UI, no runtime behavior visible to end-users. All acceptance is provable statically (types, greps) and via unit tests.

### Gaps Summary

No gaps. All 5 must-haves verified, all 6 artifacts pass Levels 1-3 (exist, substantive, wired), all key links wired, GUARD-03 enforced structurally at both seams (resolver source-file check + reducer case-body check), 21/21 unit tests green, tsc introduces zero Phase 161 errors, and all 5 PRESENT-XX requirements are satisfied at the layer this phase's charter covers (data model + resolver + plumbing). Downstream deferrals (UI rendering of the sent/viewed notice → Phase 162; renderer wiring of `isSectionVisible` → Phase 163) are explicit in the plans and consistent with the phase goal statement.

---

_Verified: 2026-07-08_
_Verifier: Claude (gsd-verifier)_
