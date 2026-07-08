---
phase: 161-presentation-settings-data-model-persistence
plan: 01
subsystem: database + domain
tags: [supabase, postgres, migration, resolver, vitest, tdd]

# Dependency graph
requires: []
provides:
  - "estimates.presentation_settings dormant-first JSONB column (nullable, no default — mirrors companies.tax_config precedent exactly)"
  - "lib/estimate/presentation-settings.ts: resolvePresentationSettings, isSectionVisible, hasEstimateBeenSentOrViewed + PresentationSettings/SectionKey/TaxOverride/DiscountOverride/DepositOverride types + DEFAULT_* constants"
  - "The ONE source of truth every Phase 162 UI and Phase 163 renderer will import from — closes the settings-drift risk PITFALLS.md #1 flagged for this milestone"
affects: [161-02, 162-*, 163-*]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dormant-first additive migration (ADD COLUMN IF NOT EXISTS, nullable, no DEFAULT) mirroring companies.tax_config from Phase 129"
    - "Pure resolver + type-guard-with-defaults idiom mirroring isTaxConfig() in lib/estimate/compute-totals.ts exactly (never throws on malformed input, always degrades to defaults)"
    - "RED→GREEN TDD cycle (failing test first, then implementation, then all-green) — same shape as tests/unit/estimate/compute-totals-guards.test.ts"

key-files:
  created:
    - supabase/migrations/20260708000002_phase161_presentation_settings.sql
    - lib/estimate/presentation-settings.ts
    - tests/unit/estimate/presentation-settings.test.ts

key-decisions:
  - "presentation_settings is JSONB nullable, no DEFAULT — NULL semantically means 'today's behavior = everything visible, no overrides' (retrocompat by construction, zero migration-time behavior change)"
  - "TaxOverride has three modes: 'default' | 'custom' | 'off'; 'off' preserves originalRate distinct from customRate so re-enabling restores the exact original value (CONTEXT.md locked decision — Tax Off never mutates tax_rate=0)"
  - "resolvePresentationSettings/isSectionVisible/hasEstimateBeenSentOrViewed are the ONLY visibility/state predicates exported — enforced by a structural export-shape test (guards against a future accidental second predicate)"
  - "GUARD-03 boundary: lib/estimate/presentation-settings.ts NEVER imports from lib/estimate/compute-totals.ts — enforced by a static test AND a grep-based acceptance criterion (grep -c compute-totals returns 0)"
  - "hasEstimateBeenSentOrViewed reuses existing estimates.sent_at/viewed_at columns — zero new tracking infrastructure needed for PRESENT-05"

patterns-established:
  - "lib/estimate/presentation-settings.ts is the SOLE resolver for per-estimate presentation state — Phase 162's gear UI and every Phase 163 renderer (classic PDF, modern PDF, classic share, modern share, plain-text template, WhatsApp formatter) MUST import from here, never re-implement a visibility check"

requirements-completed: [PRESENT-01, PRESENT-02, PRESENT-03, PRESENT-04, PRESENT-05]

# Metrics
duration: ~30min
completed: 2026-07-08
---

# Phase 161 Plan 01: Presentation Settings Data Model & Pure Resolver Summary

**Dormant-first `estimates.presentation_settings` JSONB column plus `lib/estimate/presentation-settings.ts` — the ONE pure resolver every Phase 162 UI and Phase 163 renderer will import from, following the exact `companies.tax_config` + `isTaxConfig()` precedent from `lib/estimate/compute-totals.ts`. RED→GREEN TDD, 13/13 tests green, GUARD-03 boundary enforced statically.**

## What was built

- **`supabase/migrations/20260708000002_phase161_presentation_settings.sql`** — `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS presentation_settings JSONB` (nullable, no DEFAULT) plus a documenting `COMMENT ON COLUMN`. Authored-only, not applied to any remote (deploys via CI→GHCR→Coolify per project convention).
- **`lib/estimate/presentation-settings.ts`** — pure resolver module (129 lines) exporting:
  - `SectionKey` union type (`'summary' | 'sections' | 'payment_terms' | 'timeline' | 'warranty_terms' | 'notes' | 'photos'`)
  - `PresentationSettings` interface (persisted shape) + `ResolvedPresentationSettings` interface (fully-defaulted shape)
  - `TaxOverride` / `DiscountOverride` / `DepositOverride` interfaces
  - `DEFAULT_SECTIONS`, `DEFAULT_TAX_OVERRIDE`, `DEFAULT_DISCOUNT_OVERRIDE`, `DEFAULT_DEPOSIT_OVERRIDE` constants
  - `resolvePresentationSettings(raw)` — degrades to defaults on `null`/`undefined`/malformed input, never throws
  - `isSectionVisible(resolved, section)` — the ONE visibility predicate
  - `hasEstimateBeenSentOrViewed({sent_at, viewed_at})` — reuses existing `estimates.sent_at`/`viewed_at` for PRESENT-05
  - Zero side effects, zero DB calls, zero import from `compute-totals.ts` (GUARD-03 boundary)
- **`tests/unit/estimate/presentation-settings.test.ts`** — 13 tests covering:
  - PRESENT-01: NULL/undefined/partial resolves to defaults with every non-set key defaulted
  - PRESENT-02: Non-destructive-hiding proof (resolver never touches content fields) + round-trip (serialize/deserialize preserves state, toggle back restores exact visibility)
  - PRESENT-03: TaxOverride with `mode: 'off'` preserves `originalRate` distinct from `customRate` across mode flips; malformed tax value degrades to `DEFAULT_TAX_OVERRIDE` without throwing
  - PRESENT-04: Structural export-shape assertion (`resolvePresentationSettings` + `isSectionVisible` + `hasEstimateBeenSentOrViewed` are the ONLY runtime exports — no second visibility predicate)
  - PRESENT-05: `hasEstimateBeenSentOrViewed` returns `true` for either `sent_at` or `viewed_at` non-null, `false` when both null
  - Retrocompat: legacy row (no `presentation_settings` key at all) resolves identically to explicit `null`
  - GUARD-03 boundary: source-text check — `lib/estimate/presentation-settings.ts` contains zero `compute-totals` references

## Requirements closed

| REQ | How |
|-----|-----|
| PRESENT-01 | Every estimate now has a resolvable `presentation_settings` value — NULL/absent defaults to all-7-sections-visible + no overrides, byte-identical to today's behavior |
| PRESENT-02 | Resolver never reads/writes content fields — hiding is proven non-destructive purely by data-shape separation (Phase 162 will consume this to replace `toggleField()`'s destructive semantics in `estimate-document.tsx`) |
| PRESENT-03 | TaxOverride/DiscountOverride/DepositOverride shapes support Default/Custom/Off (with Off preserving originalRate), independent of company defaults |
| PRESENT-04 | Structural test proves `isSectionVisible` is the SOLE visibility predicate — no second ad hoc check exists |
| PRESENT-05 | `hasEstimateBeenSentOrViewed` correctly derives sent/viewed state from existing `sent_at`/`viewed_at` fields |

## Testing

- `npx vitest run tests/unit/estimate/presentation-settings.test.ts` → **13/13 green** in ~26s
- GUARD-03 boundary: `grep -c "compute-totals" lib/estimate/presentation-settings.ts` → **0** ✓
- Full existing `lib/estimate/compute-totals.ts` and its test suite untouched — GUARD-03 preserved by construction

## Notes for downstream plans

- **Plan 161-02** threads the `PresentationSettings` type through the three plumbing seams: `lib/queries/estimate.ts` (query type widens with a nullable `presentation_settings` field, no changes to any `.select(...)` — every read path already uses `.select('*')`), `lib/actions/estimate.ts` (`SaveEstimateInput` gains one optional pass-through field, added to `.update(...)` payload with zero interaction with `computeEstimateTotals`), `components/workspace/estimate/use-estimate-reducer.ts` (reducer state gains a matching field, no dispatch actions yet — Phase 162 adds those with the gear UI).
- **Phase 162** consumes `resolvePresentationSettings`/`isSectionVisible` for the gear-icon settings panel (`components/workspace/estimate/estimate-floating-actions.tsx`) and rewires `estimate-document.tsx`'s `toggleField()`/`AddDetailsPopover` to READ from the resolver instead of mutating content fields to `null`. That's where the destructive→non-destructive migration actually lands in the UI.
- **Phase 163** consumes the same resolver in ALL 6 render/format surfaces (classic PDF, modern PDF, classic share, modern share, plain-text template, WhatsApp formatter), plus a cross-surface diff test that proves one toggle produces identical section visibility across all outputs — closing the settings-drift risk end-to-end.

## Operational deferrals

- Apply `supabase/migrations/20260708000002_phase161_presentation_settings.sql` to remote via CI→GHCR→Coolify — currently authored-only, not applied. The column being absent from the remote schema simply means the resolver universally receives `null` and returns defaults (today's behavior); nothing breaks pre-migration.
- Regenerate `types/database.types.ts` after migration application (so `presentation_settings` is typed at the query layer instead of relying on Plan 161-02's TS-level type widening).

## Self-check

- ✅ All 3 tasks executed (migration, RED test, GREEN implementation) and committed atomically (`6d80992f`, `eb69af67`, `03d8a84d`)
- ✅ Every acceptance criterion from the plan's `<automated>` verify blocks passes
- ✅ GUARD-03 boundary enforced statically (unit test + grep check)
- ✅ Non-destructive hiding proven at data-shape level (never touches content columns)
- ✅ All 5 requirement IDs (PRESENT-01..05) covered by working tests
- ✅ Zero touches to Phase 160 files, `estimate-document.tsx`, or any renderer (scope fence honored)
