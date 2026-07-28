---
quick_id: 260728-6ts
title: Fix discount_type mapping so AI-generated 'amount' discounts survive saveEstimate
mode: quick
status: complete
date: 2026-07-28
requirements: [QUICKFIX-01]
commits:
  - ad66f87d  # test: RED — Case F regression test (schema rejects 'amount')
  - 238d7fa6  # fix: GREEN — widen schema + shared mapDiscountTypeToEngine()
---

# Quick Task 260728-6ts — Summary

## Outcome

An AI-generated estimate's `discount_type: 'amount'` now survives the
owner's first manual `saveEstimate` call instead of being silently dropped.
Previously two compounding bugs zeroed the discount: (1)
`discountTypeSchema` rejected `'amount'` outright (`z.enum(['percentage',
'fixed'])`), failing validation before any mapping ran; (2) even past
validation, the inline `saveEstimate`/`recalculateEstimateTotals` mapping
only recognized `'percentage'`/`'fixed'` and fell through to `'none'` for
anything else. This was discovered during Phase 183 (PDF Parity Content)
research and explicitly deferred for this dedicated fix.

## What changed (1 task, TDD RED→GREEN, 2 commits)

**Commit ad66f87d — RED: Case F regression test**
Added a new test case to `tests/unit/actions/estimate-save-pricing-fields.test.ts`
mirroring `generate-estimate.ts:554`'s raw AI-generated discount write
(`discount_type: 'amount'`, never touched via the discount-type dropdown).
Confirmed it failed against unmodified code with
`"Invalid option: expected one of \"percentage\"|\"fixed\""` — proving the
test actually exercises the bug.

**Commit 238d7fa6 — GREEN: widen schema + shared mapping helper**
- `lib/schemas/estimate.ts`: widened `discountTypeSchema` from
  `z.enum(['percentage', 'fixed']).nullable()` to
  `z.enum(['percentage', 'fixed', 'amount', 'percent']).nullable()`, with an
  updated comment explaining the reducer passes the raw DB value through
  unnormalized (the `as 'percentage'|'fixed'|null` cast is compile-time
  only), so the DB domain legitimately includes `'amount'` (AI-generation
  writes) and defensively `'percent'` (the engine's own internal spelling).
- `lib/actions/estimate.ts`: extracted a single `mapDiscountTypeToEngine()`
  helper (placed after imports, before `getAuthContext`) recognizing all
  four spellings, and replaced the two previously-duplicated, independently
  buggy inline mappings in `saveEstimate` and `recalculateEstimateTotals`
  with calls to it.
- `lib/estimate/compute-totals.ts` untouched — GUARD-03 compliance
  (`git diff --stat` empty), confirming the fix only corrects which
  engine-domain value the mapping resolves to, not the totals math itself.

## Verification

- `npx vitest run tests/unit/actions/estimate-save-pricing-fields.test.ts tests/unit/actions/estimate-atomic-save.test.ts tests/unit/actions/estimate-save-concurrency.test.ts tests/unit/actions/estimate-lock-guard.test.ts` — **25/25 passed** (Case F new; Cases A-E byte-identical, no regression).
- `npx tsc -p tsconfig.ci.json --noEmit` — clean, zero errors.
- `git diff --stat lib/estimate/compute-totals.ts` — empty (GUARD-03).

Case F asserts, with subtotal 1000 and tax_rate 0.0875:
- `result` has no `error` (schema no longer rejects `'amount'`)
- `p_header.discount_amount === 100` (was silently 0 before the fix)
- `p_header.tax_amount === 78.75` (900 taxable base x 0.0875)
- `p_header.total === 978.75` ((1000 - 100) + 78.75)
- `p_header.discount_type === 'amount'` (persisted byte-identically, no lossy translation to `'fixed'`)

## Known related follow-up (out of scope, not fixed)

`lib/whatsapp/confirm-actions.ts:419-427` has the **identical** 3-branch
discount-type mapping bug (comment literally says "Identical to
lib/actions/estimate.ts"). Confirmed present, left untouched per the plan
— different call path (WhatsApp confirm flow, not the estimate editor save
path), different risk surface, out of scope for this fix. Flagged here as
a known-related bug for a future dedicated fix.

## Notes

- All work on branch `feat/serene-khorana-40485f`, not pushed as part of
  this task.
- No stubs introduced; no architectural changes; both deviation rules
  (Rule 4 - none triggered) were not needed — the plan's exact scope
  matched what the bug required.

## Self-Check: PASSED

All claimed files and commits verified present:
- FOUND: lib/schemas/estimate.ts
- FOUND: lib/actions/estimate.ts
- FOUND: tests/unit/actions/estimate-save-pricing-fields.test.ts
- FOUND: 260728-6ts-SUMMARY.md
- FOUND commit: ad66f87d
- FOUND commit: 238d7fa6
