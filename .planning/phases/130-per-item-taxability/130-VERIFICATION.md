---
phase: 130-per-item-taxability
verified: 2026-06-25T07:51:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 130: Per-Item Taxability Verification Report

**Phase Goal:** Per-item taxability (TAX-02, TAX-03) — the AI classifies labor/materials per item (never computes tax), and the server math engine computes tax PER-CATEGORY from `companies.tax_config` while staying byte-identical on the retrocompat (no-config) path.
**Verified:** 2026-06-25T07:51:00Z
**Status:** passed
**Re-verification:** No — initial verification

## VERIFICATION PASSED

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | AI output schema + types carry OPTIONAL `taxable`/`tax_category` per item; AI classifies, never computes | ✓ VERIFIED | `lib/ai/schema.ts:31-32` (`taxable: z.boolean().optional()`, `tax_category: z.enum([...]).optional().nullable()`, no `.default`); `lib/ai/types.ts:20-21` mirror |
| 2 | Both providers expose `taxable`/`tax_category` as ADVISORY (in `properties`, NOT in `required[]`); prompt instructs classification-only | ✓ VERIFIED | `anthropic.ts:70` required has only the 4 originals; fields at L81/L85 + L192/L196. `gemini.ts` L131/135 + L224/228. `prompt-builder.ts:87` "CLASSIFICATION ONLY — never compute" before `## Security` (L101) |
| 3 | Schema test accepts-with-fields AND accepts-on-omission; ENG-01 fence stays green (no calculator, no server-trusted computed total) | ✓ VERIFIED | `tax-classification-schema.test.ts` passes; `no-ai-calculator.test.ts` green |
| 4 | Engine computes tax PER-CATEGORY from `tax_config`; absent config falls through to flat `round(subtotal×taxRate)` byte-identical (850.99/85.1/936.09); per-item taxable/tax_category persisted | ✓ VERIFIED | `compute-totals.ts:92-123` branch on `isTaxConfig`; flat fallthrough L95 unchanged. `generate-estimate.ts:109` select, L334-341 thread, L472-473 persist |
| 5 | New active-path test (labor-exempt → 40/1540) passes; retrocompat + GUARD-03 totals-authority green | ✓ VERIFIED | `per-category-tax.test.ts` labor-exempt golden taxAmount=40/grandTotal=1540 passes; `pricing-retrocompat.test.ts` 850.99/85.1/936.09 (omitted AND explicit-null); `totals-authority.test.ts` green |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `lib/ai/schema.ts` | optional taxable + tax_category on lineItemSchema, no default | ✓ VERIFIED | L31-32, additive, `.optional().nullable()` |
| `lib/ai/types.ts` | LineItemOutput widened with optional fields | ✓ VERIFIED | L20-21 |
| `lib/ai/providers/anthropic.ts` | advisory fields on both tool blocks, not required | ✓ VERIFIED | L81-89, L192-200; required[] excludes them |
| `lib/ai/providers/gemini.ts` | advisory fields on both blocks | ✓ VERIFIED | L131-139, L224-232 |
| `lib/ai/prompt-builder.ts` | classification-only instruction, Security last | ✓ VERIFIED | L87 before L101 Security |
| `lib/estimate/compute-totals.ts` | per-category branch on taxConfig + byte-identical flat fallthrough | ✓ VERIFIED | L92-123; `item.taxable ?? true` L102; flat L95 |
| `lib/services/generate-estimate.ts` | reads tax_config, threads to compute, persists per-item | ✓ VERIFIED | select L109, thread L334-341, persist L472-473 |
| `tests/unit/ai/tax-classification-schema.test.ts` | accept/omit/reject-enum | ✓ VERIFIED | passes |
| `tests/unit/estimate/per-category-tax.test.ts` | labor-exempt + fallback goldens | ✓ VERIFIED | 5 cases pass |
| `tests/unit/services/pricing-retrocompat.test.ts` | ENG-02 byte-identical + omit-vs-null | ✓ VERIFIED | 850.99/85.1/936.09 both paths |

### Key Link Verification

| From | To | Via | Status |
| --- | --- | --- | --- |
| prompt-builder.ts | AI model | classification instruction (labor/materials, no math) | ✓ WIRED (L87) |
| anthropic.ts / gemini.ts | create_estimate tool | advisory taxable/tax_category NOT in required[] | ✓ WIRED |
| generate-estimate.ts | companies.tax_config | `.select(... tax_config)` + passed to computeEstimateTotals | ✓ WIRED (L109, L341) |
| generate-estimate.ts | estimate_items | itemRows insert carries taxable + tax_category | ✓ WIRED (L472-473) |
| compute-totals.ts | per-category rate map | taxConfig branch summing taxable base per tax_category | ✓ WIRED (L96-123) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Targeted phase 130 tests | `vitest run` of 5 phase files | 25/25 passed | ✓ PASS |
| Full suite | `npx vitest run` | 2378 passed, 1 known flake | ✓ PASS |
| Known flake isolation | `vitest run mcp-route-contract.test.ts` | 8/8 passed in isolation | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| TAX-02 | 130-01 | AI schema/types carry taxable/tax_category; AI classifies, never computes | ✓ SATISFIED | schema/types/providers/prompt + green schema + fence tests |
| TAX-03 | 130-02 | Server math computes per-category tax from tax_config; byte-identical when absent | ✓ SATISFIED | compute-totals branch + engine wire + goldens green |

### Anti-Patterns Found

None. The optional-on-omission schema fields are intentional additive scaffold (server applies the `taxable ?? true` default), not stubs — the byte-identical retrocompat path is pinned by the green retrocompat golden.

### Human Verification Required

None — all checks are programmatically verifiable and green.

### Gaps Summary

No gaps. All 5 must-haves verified across both plans. The ENG-01 no-AI-calculator fence and the ENG-02/GUARD-03 retrocompat goldens remain green; the locked calculation sequence is honored (discount/deposit dormant as scoped to Phases 131-132).

**Full suite:** 2378 passed, 2 skipped, 33 todo. The ONLY failure is the documented non-blocking flake `tests/unit/mcp-route-contract.test.ts > GET returns 405` (times out in parallel, passes 8/8 in isolation — confirmed). Per the known-flake rule, the suite is treated as GREEN.

---

_Verified: 2026-06-25T07:51:00Z_
_Verifier: Claude (gsd-verifier)_
