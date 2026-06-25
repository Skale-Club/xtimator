---
phase: 132-deposit-markup-stripe
plan: 02
subsystem: estimate-engine
tags: [markup, cost, pricing, compute-totals, ai-schema, MARK-01]
requires:
  - "lib/estimate/compute-totals.ts (deterministic totals engine)"
  - "lib/ai/schema.ts + lib/ai/types.ts (AI output contract)"
  - "Phase-129 nullable cost/markup_pct estimate_items columns"
provides:
  - "Optional per-item cost + markup_pct AI INPUTS (schema/types + both adapters)"
  - "Server-derived unit_price = round2(cost × (1 + markup_pct/100)) when cost+markup present and no explicit price"
  - "Persisted cost + markup_pct per estimate_items row"
affects:
  - "lib/estimate/compute-totals.ts"
  - "lib/services/generate-estimate.ts"
  - "lib/ai/providers/anthropic.ts + gemini.ts"
tech-stack:
  added: []
  patterns:
    - "AI supplies cost/markup as INPUTS; the server does the arithmetic (never-trust-LLM, GUARD-03/ENG-01)"
    - "Optional-no-default schema fields → byte-identical retrocompat when omitted (ENG-02)"
    - "effectiveUnitPrice resolved at top of item map before lineGross; explicit unit_price>0 wins"
key-files:
  created:
    - "tests/unit/ai/markup-input-schema.test.ts (Task 1, committed in a0ba62e5)"
    - "tests/unit/estimate/markup-totals.test.ts"
  modified:
    - "lib/ai/schema.ts"
    - "lib/ai/types.ts"
    - "lib/ai/providers/anthropic.ts"
    - "lib/ai/providers/gemini.ts"
    - "lib/estimate/compute-totals.ts"
    - "lib/services/generate-estimate.ts"
decisions:
  - "PRECEDENCE locked: explicit unit_price>0 wins; markup derives the price only when cost+markup present and no explicit positive price; price-book anchoring/clamp (GUARD-02) runs after and still overrides — unchanged"
  - "cost/markup_pct are NOT added to ENG-01 FORBIDDEN list — they are inputs, not computed totals; the regex only matches exact computed-total names"
metrics:
  duration: "~12m (continuation: Task 1 pre-committed)"
  completed: "2026-06-25T13:06:00Z"
  tasks: 3
  files: 8
---

# Phase 132 Plan 02: Markup cost→price (MARK-01) Summary

Server-derived unit_price from per-item cost + markup_pct AI inputs — the AI provides cost/markup, the deterministic engine computes `round2(cost × (1 + markup_pct/100))` only when both are present and no explicit positive unit_price was anchored; explicit price and price-book anchoring still win, and omitting cost/markup keeps every standing golden byte-identical.

## What Was Built

- **AI contract (Task 1)** — optional, non-negative `cost` + `markup_pct` on `lineItemSchema` (no `.default`), mirrored on `LineItemOutput`, declared as plain number item properties in both Anthropic and Gemini `create_estimate` tool blocks (generate + refine call sites) with "the SERVER computes the price — you only provide cost + markup" descriptions. Not added to any `required` array. `markup-input-schema.test.ts` proves accept-both / omit-undefined / reject-negative.
- **Server math (Task 2)** — `compute-totals.ts` resolves `effectiveUnitPrice` at the top of `section.items.map` before `lineGross`: `hasMarkup && !hasExplicitPrice` → `Math.round(cost × (1 + markup_pct/100) × 100)/100`, else `item.unit_price`. The resolved price is returned on the item (`unit_price: effectiveUnitPrice`) so persistence reads it. No-op when cost/markup absent → byte-identical.
- **Persistence (Task 3)** — `generate-estimate.ts` itemRows insert persists `cost` + `markup_pct` (null when absent) alongside discount/taxable; the persisted `unit_price` already carries the server-resolved markup price from Task 2.

## Verification Results

- `tests/unit/estimate/markup-totals.test.ts` — DERIVE (cost 80 → unit_price 100 → total 200), EXPLICIT-WINS (500 stays 500), RETROCOMPAT (850.99 / 85.1 / 936.09) all GREEN.
- `tests/unit/ai/markup-input-schema.test.ts` — accept / omit / reject-negative GREEN.
- `tests/unit/ai/no-ai-calculator.test.ts` — ENG-01 fence GREEN (cost/markup_pct are inputs, not computed totals).
- All standing goldens byte-identical: pricing-retrocompat (850.99/85.1/936.09), discount-totals, deposit-totals (132-01), per-category-tax.
- Full suite: `tests/unit/estimate tests/unit/services tests/unit/ai` — 314 passed (51 files).
- `grep -c markup_pct` across all 6 target files: each ≥ 1 (schema 3, types 3, anthropic 4, gemini 4, compute-totals 4, generate-estimate 2).

## Deviations from Plan

None — plan executed exactly as written.

Note: This plan was resumed as a continuation. Task 1 (schema/types/adapters + `markup-input-schema.test.ts`) was already committed in `a0ba62e5` before this run; Task 2's `ComputeTotalsItem` interface fields and the `markup-totals.test.ts` (RED) were already on disk. This run completed Task 2's resolution logic (GREEN, committed `b00cadcf`) and Task 3 persistence (committed `7376df3f`).

## Known Stubs

None. cost/markup_pct flow end-to-end: AI input → schema validation → server derivation in compute-totals → persisted per-item.

## Self-Check: PASSED

- FOUND: lib/ai/schema.ts, lib/ai/types.ts, lib/ai/providers/anthropic.ts, lib/ai/providers/gemini.ts, lib/estimate/compute-totals.ts, lib/services/generate-estimate.ts
- FOUND: tests/unit/ai/markup-input-schema.test.ts, tests/unit/estimate/markup-totals.test.ts
- FOUND commits: a0ba62e5 (Task 1), b00cadcf (Task 2), 7376df3f (Task 3)
