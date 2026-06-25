---
phase: 130-per-item-taxability
plan: 01
subsystem: ai
tags: [zod, anthropic, gemini, tax-classification, schema, prompt-engineering]

# Dependency graph
requires:
  - phase: 129-pricing-schema-engine-scaffold
    provides: "estimate_items.tax_category CHECK enum (labor|materials|other) + ENG-01 no-AI-calculator fence + retrocompat totals golden"
provides:
  - "AI output schema (estimateOutputSchema/lineItemSchema) widened with OPTIONAL per-item taxable (boolean) + tax_category ('labor'|'materials'|'other')"
  - "LineItemOutput type mirrors the optional fields"
  - "Advisory taxable/tax_category create_estimate tool fields on both anthropic + gemini (not required)"
  - "Classification-only ## Tax Classification prompt instruction with explicit no-arithmetic clause; Security stays LAST"
  - "tests/unit/ai/tax-classification-schema.test.ts proving accept-with-fields, accept-on-omission (no injected default), reject-bad-enum"
affects: [130-02 per-item-taxability server tax math, 133 editor fields, 134 pdf]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive optional zod fields (no .default) preserve byte-identical retrocompat — server applies the default, not the schema"
    - "AI receives classification INPUT (labor vs materials) with explicit no-arithmetic language — ENG-01 calculator fence intact"

key-files:
  created:
    - tests/unit/ai/tax-classification-schema.test.ts
  modified:
    - lib/ai/schema.ts
    - lib/ai/types.ts
    - lib/ai/providers/anthropic.ts
    - lib/ai/providers/gemini.ts
    - lib/ai/prompt-builder.ts

key-decisions:
  - "No .default(true) on taxable in the schema — omitted fields stay undefined so the byte-identical retrocompat path holds; the taxable=true default is applied SERVER-SIDE in Plan 130-02."
  - "tax_category zod enum matches the Phase 129 migration CHECK exactly: 'labor' | 'materials' | 'other' (+ .nullable() to accept an explicit null from a downstream caller)."
  - "Gemini tool schema uses Type.STRING for tax_category (Gemini has no Type.ENUM); the authoritative zod gate enforces the enum. Both providers keep taxable/tax_category OUT of required[]."

patterns-established:
  - "Optional-additive AI contract widening: schema + type + both provider tool schemas + prompt instruction, all non-breaking, with a schema test pinning both the accept-with-fields and the omission-retrocompat paths."

requirements-completed: [TAX-02]

# Metrics
duration: 4min
completed: 2026-06-25
---

# Phase 130 Plan 01: Per-Item Taxability AI Contract (TAX-02) Summary

**Widened the AI estimate output contract so each line item can carry an OPTIONAL `taxable` boolean and `tax_category` ('labor'|'materials'|'other') as pure CLASSIFICATION INPUT — omission validates byte-identically and the ENG-01 no-AI-calculator fence stays green.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-25T11:31:28Z
- **Completed:** 2026-06-25T11:35:13Z
- **Tasks:** 2 / 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

### Task 1 — Widen schema + types (TAX-02)
- `lib/ai/schema.ts`: added `taxable: z.boolean().optional()` and `tax_category: z.enum(['labor','materials','other']).optional().nullable()` to `lineItemSchema`. No `.default` — the retrocompat path keeps omitted fields `undefined`. `EstimateOutput` (z.infer) picks the fields up automatically.
- `lib/ai/types.ts`: mirrored `taxable?: boolean` and `tax_category?: 'labor' | 'materials' | 'other' | null` on `LineItemOutput`.
- `tests/unit/ai/tax-classification-schema.test.ts` (NEW): accept-with-fields (preserves both values), accept-on-omission (both `undefined`, no injected default), full-enum acceptance, reject-bad-enum (`'plumbing'`), and a `LineItemOutput` compile check.

### Task 2 — Advisory provider fields + classification prompt (TAX-02)
- `lib/ai/providers/anthropic.ts`: advisory `taxable` + `tax_category` (enum) added to BOTH create_estimate item-property blocks (generate + refine), kept OUT of `required`.
- `lib/ai/providers/gemini.ts`: same advisory fields on BOTH blocks (`Type.BOOLEAN` + `Type.STRING`, matching Gemini's no-Type.ENUM convention), kept OUT of `required`.
- `lib/ai/prompt-builder.ts`: appended a `## Tax Classification` block after the price-book block — labor/materials/other classification, with an explicit "CLASSIFICATION ONLY — never compute, add, or estimate any tax amount" clause. The `## Security` block remains the LAST appended section.

## Verification

- `npx vitest run tests/unit/ai` → 14 files / 82 tests passed (includes the new schema test + the ENG-01 fence `no-ai-calculator.test.ts`).
- `npx vitest run tests/unit/services/pricing-retrocompat.test.ts` → 4/4 green (totals math unchanged, as expected).
- `npx tsc --noEmit` on the changed files (`schema.ts`, `types.ts`, `providers/anthropic.ts`, `providers/gemini.ts`, `prompt-builder.ts`, new test) → clean.

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues

Pre-existing `npx tsc --noEmit` errors in UNRELATED test files (out of scope per the scope boundary — not introduced by this plan, none in this plan's changed files):
- `tests/unit/ai/refine-shared-prompt.ts`, `tests/unit/estimate/observability.test.ts` — TS1501 es2018 regex-flag errors.
- `tests/unit/estimate/step-runner.test.ts`, `tests/unit/inngest/generate-estimate-job.test.ts` — mock typing errors.
- `tests/unit/whatsapp/handler*.test.ts`, `handler-intent-routing.test.ts` — `Entitlements` missing `chatEnabled` in test fixtures.

These pre-date Plan 130-01 and are logged to `.planning/phases/130-per-item-taxability/deferred-items.md`. Not fixed (unrelated to the current task's changes).

## Known Stubs

None. The fields are an additive, dormant-by-omission AI contract widening by design (the server reader/default lands in Plan 130-02). This is intentional scaffold, not a stub: omission validates byte-identically and the schema test pins that behavior.

## Self-Check: PASSED
