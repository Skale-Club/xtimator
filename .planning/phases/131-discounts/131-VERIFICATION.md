---
phase: 131-discounts
verified: 2026-06-25T08:14:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
---

# Phase 131: Discounts Verification Report

**Phase Goal:** DISC-01 + DISC-02 — per-item line discount AI INPUT + server math applying line discount before subtotal and global discount before tax (prorated into the per-category taxable base, discount-before-tax LOCKED sequence), persisted via existing columns with byte-identical retrocompat.
**Verified:** 2026-06-25T08:14:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | DISC-01: AI schema + types carry an OPTIONAL per-item line `discount` (amount, non-negative, NO `.default`); global discount reuses existing `estimates.discount_*` columns; schema test parses optional discount; no-ai-calculator fence green | ✓ VERIFIED | `lib/ai/schema.ts:38` `discount: z.number().finite().nonnegative().optional()`; `lib/ai/types.ts:23` `discount?: number`; `discount-input-schema.test.ts` 4 cases pass (parses-with-50, parses-on-omission→undefined, rejects -5); `no-ai-calculator.test.ts` green; no new migration columns added |
| 2 | DISC-02: `compute-totals.ts` implements LOCKED sequence (line_net = round2(qty×unit_price) − discount; disc_global amount/round2(subtotal×pct); prorated into per-category taxable base; grandTotal = (subtotal − disc_global) + taxAmount); returns `discountAmount`; engine persists per-item discount + estimate discount_type/value/amount replacing hardcoded null/0/0; no-discount → byte-identical null/0/0 | ✓ VERIFIED | `compute-totals.ts:101-154` LOCKED sequence exact; returns `discountAmount: discGlobal`; `generate-estimate.ts:341,350,422-424,480` thread + persist; hardcoded `discount_amount: 0` GONE (`discount-persistence.test.ts` `not.toContain('discount_amount: 0')` passes) |
| 3 | RETROCOMPAT: all goldens green — pricing-retrocompat 850.99/85.1/936.09, per-category-tax 40/1540, new discount-totals 1440/1890/1296; GUARD-03 totals-authority green | ✓ VERIFIED | `discount-totals.test.ts` asserts 1440/1890/1296 + discountAmount 0/200/300 + line.total 900; `pricing-retrocompat.test.ts` 850.99/85.1/936.09 (omitted + explicit-null); `per-category-tax.test.ts` 40/1540; `totals-authority.test.ts` green |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `lib/ai/schema.ts` | Optional `discount` (amount, no default) | ✓ VERIFIED | L38 `.nonnegative().optional()`, no `.default` |
| `lib/ai/types.ts` | Mirror `discount?: number` | ✓ VERIFIED | L23 present, re-exports EstimateOutput from schema (no drift) |
| `lib/estimate/compute-totals.ts` | Line + global discount, proration, `discountAmount` in return | ✓ VERIFIED | L44 return field, L96-152 LOCKED math, /0-guard at L142 |
| `lib/services/generate-estimate.ts` | Threads `discountAmount`, persists discount_* + item.discount | ✓ VERIFIED | L341/350/422-424/480; reuses existing columns |
| `tests/unit/ai/discount-input-schema.test.ts` | Accept-with / accept-omit / reject-negative | ✓ VERIFIED | 4 cases pass |
| `tests/unit/estimate/discount-totals.test.ts` | Goldens 1440/1890/1296 + retrocompat | ✓ VERIFIED | 4 cases pass |
| `tests/unit/services/discount-persistence.test.ts` | Static-source persistence gate | ✓ VERIFIED | 4 cases pass incl. negative no-hardcoded-0 |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| schema.ts | types.ts | `EstimateOutput = z.infer` re-export | ✓ WIRED | types.ts:36 re-exports; `discount` present on both LineItem shapes |
| compute-totals.ts | generate-estimate.ts | `ComputeTotalsResult.discountAmount` | ✓ WIRED | destructured L341, coerced L350, persisted L423-424 |
| calculatedSections[].items[].discount | estimate_items.discount | itemRows insert | ✓ WIRED | L480 `discount: (item.discount as number \| undefined) ?? 0` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| generate-estimate.ts persist | `discountAmount` | `computeEstimateTotals()` return | Yes — computed disc_global, not hardcoded | ✓ FLOWING |
| estimate_items.discount | `item.discount` | AI input → `...item` spreads through anchoring/research/compute | Yes — survives spreads (mirrors taxable/tax_category precedent) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Optional discount parses (with/omit/reject) | vitest discount-input-schema | 4 passed | ✓ PASS |
| LOCKED math goldens 1440/1890/1296 | vitest discount-totals | 4 passed | ✓ PASS |
| Retrocompat 850.99/85.1/936.09 byte-identical | vitest pricing-retrocompat | passed | ✓ PASS |
| Per-category tax 40/1540 | vitest per-category-tax | passed | ✓ PASS |
| Engine persists computed (not hardcoded 0) | vitest discount-persistence | 4 passed | ✓ PASS |
| AI-never-computes fence | vitest no-ai-calculator | passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| DISC-01 | 131-01, 131-03 | Schema line + global discount fields | ✓ SATISFIED | schema/types optional discount; columns reused; persistence wired |
| DISC-02 | 131-02, 131-03 | Server math: line before subtotal, global before tax, prorated into taxable base | ✓ SATISFIED | compute-totals LOCKED sequence; goldens green; before-tax default with named after-tax follow-up comment |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| compute-totals.ts | 99-100 | FOLLOW-UP comment (after-tax timing branch) | ℹ️ Info | Intentional, scoped per LOCKED sequence; before-tax is US-norm default and the only requirement this phase |

No blocker or warning anti-patterns. No hardcoded empty data flowing to output; the `?? 0` / `?? null` coalescing seams are retrocompat defaults, not stubs (overwritten by real AI input / computed values when present).

### Full Suite

`npx vitest run`: **1 failed | 2390 passed | 2 skipped | 33 todo** (348 files). The single failure is `tests/unit/mcp-route-contract.test.ts > GET returns 405` — the KNOWN non-blocking parallel-only flake (timeout under parallel load). Confirmed it passes 8/8 in isolation (`npx vitest run tests/unit/mcp-route-contract.test.ts`). Per the stated rule, with this as the ONLY failure the suite is treated as GREEN.

### Human Verification Required

None. All truths verified programmatically.

### Gaps Summary

No gaps. DISC-01 and DISC-02 fully achieved: optional per-item line discount AI input (no default, non-negative, byte-identical on omission), the LOCKED discount-before-tax calculation sequence with proration into the per-category taxable base, `discountAmount` returned and persisted into the reused `estimates.discount_*` columns + per-item `estimate_items.discount`, with all goldens (1440/1890/1296, 850.99/85.1/936.09, 40/1540) and GUARD-03 totals-authority + no-ai-calculator fences green. No new database columns added.

---

_Verified: 2026-06-25T08:14:00Z_
_Verifier: Claude (gsd-verifier)_
