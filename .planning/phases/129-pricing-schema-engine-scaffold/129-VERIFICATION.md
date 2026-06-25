---
phase: 129-pricing-schema-engine-scaffold
verified: 2026-06-25T07:24:00Z
status: passed
score: 3/3 must-haves verified (TAX-01, ENG-01, ENG-02)
re_verification: null
---

# Phase 129: Pricing Schema + Engine Scaffold Verification Report

**Phase Goal:** Land the v4.11 advanced-pricing FOUNDATION — an idempotent authored-only migration with all dormant columns (TAX-01), a standing no-AI-calculator fence (ENG-01), and a byte-identical retrocompat totals scaffold + golden guard (ENG-02).
**Verified:** 2026-06-25T07:24:00Z
**Status:** passed
**Re-verification:** No — initial verification

## VERIFICATION PASSED

All 3 requirements (TAX-01, ENG-01, ENG-02) verified at every level: artifacts exist, are substantive, are wired into the production path, and the tests lock the contract. The full suite is green (the only parallel failure is the documented mcp-route-contract GET-405 flake, which passes in isolation).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | TAX-01: one idempotent authored-only migration lands all 9 dormant columns with retrocompat defaults, reuses `estimates.discount_*`, adds NO new `estimates.discount`, with 2 named CHECKs | ✓ VERIFIED | Migration file present (37 lines); 9 `ALTER TABLE … ADD COLUMN IF NOT EXISTS`; named CHECKs `estimate_items_tax_category_check` + `estimates_deposit_type_check` (DROP+ADD each); estimates block has no `discount` add; static contract test 6/6 green |
| 2 | ENG-01: a static test asserts the AI's only tool is `create_estimate`, no calculator tool, no server-trusted computed-total item field — across anthropic.ts + gemini.ts | ✓ VERIFIED | `create_estimate` present in both providers; `tool_choice: { type: 'tool', name: 'create_estimate' }` (anthropic), `allowedFunctionNames: ['create_estimate']` (gemini); zero `calculat` matches in providers dir; no-ai-calculator test 3/3 green |
| 3 | ENG-02 (load-bearing): `compute-totals.ts` reproduces GUARD-03 default math byte-identically; engine calls it; golden pins 850.99 / 85.1 / 936.09; totals-authority stays green | ✓ VERIFIED | Helper exports `computeEstimateTotals` with literal `Math.round(x*100)/100` + `item.discount ?? 0` seam; engine imports (L10) and calls it (L337); old inline math removed (grep → 0); pricing-retrocompat 4/4 green; totals-authority green |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/20260627000001_phase129_advanced_pricing_schema.sql` | 9 dormant columns + 2 named CHECKs, idempotent, no new estimates.discount | ✓ VERIFIED | 5 on estimate_items (taxable BOOLEAN NOT NULL DEFAULT true, tax_category TEXT, discount NUMERIC(12,2) NOT NULL DEFAULT 0, cost, markup_pct), 3 on estimates (deposit_type TEXT NOT NULL DEFAULT 'none', deposit_value, balance_due), 1 on companies (tax_config JSONB) |
| `tests/unit/estimate/advanced-pricing-migration.test.ts` | Static SQL contract test | ✓ VERIFIED | readFileSync + grep; 6 tests; ALTER-scoped regex correctly counts 9 (auto-fixed comment false-positive per SUMMARY) |
| `tests/unit/ai/no-ai-calculator.test.ts` | ENG-01 static assertion | ✓ VERIFIED | 3 tests over both providers; FORBIDDEN numeric-total field set; no calculator regex |
| `lib/estimate/compute-totals.ts` | Pure default-path helper | ✓ VERIFIED | 63 lines; pure function, dormant default-coalescing seams; no round2 in default arithmetic |
| `tests/unit/services/pricing-retrocompat.test.ts` | ENG-02 golden over REAL helper | ✓ VERIFIED | Imports the production helper; pins 850.99 / 85.1 / 936.09 + per-item/section math + zero-discount collapse + flat-tax branch |
| `lib/services/generate-estimate.ts` | GUARD-03 block calls helper | ✓ VERIFIED | import L10, call L337; persistence block byte-stable (discount_type:null/value:0/amount:0 at L414-416) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| generate-estimate.ts | compute-totals.ts | import + call in GUARD-03 block | ✓ WIRED | import L10, destructured call L337; downstream (assertFinitePositive, totalsSane, persistence) byte-unchanged |
| pricing-retrocompat.test.ts | compute-totals.ts | imports REAL `computeEstimateTotals` | ✓ WIRED | Guards production path, not a copy |
| advanced-pricing-migration.test.ts | migration .sql | readFileSync + grep | ✓ WIRED | Asserts exact column/type/default/CHECK text |
| no-ai-calculator.test.ts | anthropic.ts + gemini.ts | readFileSync + grep | ✓ WIRED | Both providers asserted |

### Data-Flow Trace (Level 4)

N/A — this phase ships schema (dormant, no reader), static tests, and a refactor of an existing server-side math block. No dynamic-data-rendering artifacts. The retrocompat helper's data flow is locked by the golden test over the real production function.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 129 targeted tests pass | `vitest run` (4 files) | 4 files / 20 tests passed | ✓ PASS |
| ENG-02 golden locks 850.99/85.1/936.09 | pricing-retrocompat.test.ts | 4/4 green | ✓ PASS |
| GUARD-03 runtime authority intact | totals-authority.test.ts | green | ✓ PASS |
| Full suite | `npx vitest run` | 339 passed / 1 failed (known flake) / 3 skipped; 2367 tests passed | ✓ PASS (flake) |
| Known flake passes in isolation | `vitest run mcp-route-contract.test.ts` | 8/8 passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| TAX-01 | 129-01 | Schema: estimate_items.taxable + tax_category, companies.tax_config; idempotent migration, retrocompat defaults | ✓ SATISFIED | Migration + contract test |
| ENG-01 | 129-01 | New arithmetic extends GUARD-03 single authority; static test asserts no AI calculator | ✓ SATISFIED | no-ai-calculator test + providers |
| ENG-02 | 129-02 | Retrocompat invariant: byte-identical subtotal/tax/total with no new fields; regression test locks happy path | ✓ SATISFIED | compute-totals helper + golden test + engine wiring |

No orphaned requirements: REQUIREMENTS.md maps exactly TAX-01, ENG-01, ENG-02 to Phase 129 and all three are claimed by plans 129-01/129-02.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | Dormant columns / default-coalescing seams (discount ?? 0, taxable, taxConfig) | ℹ️ Info | By-design scaffold per SCOPE FENCE; activated in Phases 130-132. NOT a stub — the migration defaults preserve byte-identity and the golden test proves it. |

No blocker or warning anti-patterns. No TODO/FIXME/placeholder, no empty returns, no hardcoded-empty data flowing to output.

### Human Verification Required

None. All verification is programmatic (static SQL contract, static AI-fence, golden-number regression over the real helper). The migration is authored-only by design (CI→GHCR→Coolify carries it; never applied on the VPS), consistent with project memory.

### Gaps Summary

No gaps. The phase goal is achieved:
- TAX-01 migration is idempotent (9× ADD COLUMN IF NOT EXISTS + DROP/ADD named CHECKs), lands all dormant columns with retrocompat defaults, and adds no new `estimates.discount` column (reuses the existing `discount_*`).
- ENG-01 static fence proves the AI's only tool is `create_estimate` with no calculator and no server-trusted computed-total field across both providers.
- ENG-02 helper reproduces the GUARD-03 default math byte-identically, the engine calls it, and the golden test locks 850.99 / 85.1 / 936.09 with totals-authority still green.

Full suite: 2367 tests passed, 1 failure (`mcp-route-contract.test.ts` GET-405) which is the documented non-blocking parallel-only flake — it passes 8/8 in isolation. Suite treated as green.

---

_Verified: 2026-06-25T07:24:00Z_
_Verifier: Claude (gsd-verifier)_
