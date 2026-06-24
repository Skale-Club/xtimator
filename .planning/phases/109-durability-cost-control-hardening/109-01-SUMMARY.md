---
phase: 109-durability-cost-control-hardening
plan: 01
subsystem: estimate-render-types
tags: [type-widening, price_source, researched, build-fix, render-path]
requires:
  - "lib/ai/types.ts canonical price_source union ('price_book' | 'ai_estimate' | 'researched')"
  - "Phase 108 live wire that persists 'researched' items at runtime"
provides:
  - "DocumentItem.price_source union including 'researched' (document/PDF/share render path)"
  - "EstimateItem.price_source union including 'researched' (query/share-view source type)"
  - "refine route existingEstimate price_source cast including 'researched'"
affects:
  - "components/workspace/estimate/estimate-document.tsx"
  - "lib/queries/estimate.ts"
  - "app/api/estimates/[id]/refine/route.ts"
  - "components/share/estimate-view.tsx (transitively — maps EstimateItem→DocumentItem)"
  - "components/workspace/estimate/estimate-editor.tsx (transitively — TS2322 resolved)"
tech-stack:
  added: []
  patterns:
    - "Mirror the canonical lib/ai/types.ts price_source union at every render-path boundary"
key-files:
  created: []
  modified:
    - "components/workspace/estimate/estimate-document.tsx"
    - "lib/queries/estimate.ts"
    - "app/api/estimates/[id]/refine/route.ts"
decisions:
  - "Type-level only: no runtime/logic change. The `?? 'ai_estimate'` default in the refine cast is unchanged — only the cast widens."
metrics:
  duration: ~8m
  completed: 2026-06-24
  tasks: 2
  files: 3
  commits: 1
---

# Phase 109 Plan 01: Widen Render-Path `price_source` Unions Summary

Widen the three render-path `price_source` unions/casts to include `'researched'` — mirroring the canonical `lib/ai/types.ts` union — so `next build` type-checks cleanly now that Phase 108 wired the researched-pricing path live and `researched` items actually occur at runtime. Pure type widening, zero runtime behavior change.

## What Was Built

Three one-line type widenings closing the carried-over Phase-108 build-fix:

1. **`components/workspace/estimate/estimate-document.tsx` (L274)** — `DocumentItem.price_source` widened from `'price_book' | 'ai_estimate' | null` to `'price_book' | 'ai_estimate' | 'researched' | null`. This is the document / PDF / share render component's item provenance type.
2. **`lib/queries/estimate.ts` (L64)** — `EstimateItem.price_source` widened the same way. This is the source type that `components/share/estimate-view.tsx` (L128) maps into `DocumentItem` and that the workspace queries return, so widening it here keeps both consumers type-correct.
3. **`app/api/estimates/[id]/refine/route.ts` (L213)** — the `existingEstimate.sections` map cast widened from `as 'price_book' | 'ai_estimate'` to `as 'price_book' | 'ai_estimate' | 'researched'`, so a re-hydrated `researched` item is not narrowed back at the `EstimateOutput` boundary. The `?? 'ai_estimate'` default is unchanged.

The Phase-108-verifier-flagged `estimate-editor.tsx` TS2322 is resolved transitively because `DocumentItem` now accepts `'researched'`.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Widen all three render-path `price_source` unions to include `'researched'` | 181e3a3 | estimate-document.tsx, lib/queries/estimate.ts, refine/route.ts |
| 2 | Confirm no remaining render-path `price_source` union omits `'researched'` (verification-only) | (no edits) | — |

## Verification

- **Scoped tsc (`tsconfig.json`)** over the three changed files: `SCOPED-CLEAN` — zero `price_source`/`researched`/`TS2322` errors.
- **CI tsc (`tsconfig.ci.json`)**: `CI-CLEAN` — zero `price_source`/`researched`/`TS2322` errors. (CI uses the scoped config; the long-standing repo-wide es2018/tsconfig mismatches are pre-existing and unrelated, not introduced here.)
- **Task 2 sweep** (`grep` for omitting unions/casts of the form `'price_book' | 'ai_estimate'` with optional `| null`): `SWEEP-CLEAN` — none remain in `components/`, `lib/`, or `app/`. The complete set of provenance unions now accepting `'researched'`: the three from Task 1 plus the two already-correct ones (`use-estimate-reducer.ts` L19/L94, `lib/actions/estimate.ts` L51) and the canonical `lib/ai/types.ts` L17. `item-row.tsx` L90 + `item-card-mobile.tsx` L59 already render the `researched` badge (untouched, per plan). No separate `@react-pdf`/puppeteer render component with its own union exists.
- **Full vitest suite**: `npx vitest run` → **275 files passed | 3 skipped, 1924 passed | 2 skipped | 33 todo** — byte-identical to the Phase-108 (108-05) baseline. Type-only change → zero test delta, as expected.
- **gitleaks**: ran on the hooked commit (normal commit, no `--no-verify`) — `no leaks found`.

## Deviations from Plan

None - plan executed exactly as written. Both target files matched the CONTEXT interface signatures at the documented line numbers; the two already-widened unions (`use-estimate-reducer.ts`, `lib/actions/estimate.ts`) and the two badge renderers (`item-row.tsx`, `item-card-mobile.tsx`) were confirmed correct and left untouched. No new omitting union surfaced in the Task 2 sweep.

## Known Stubs

None. This is a type-level change to existing, live render-path code; no placeholders, empty defaults, or unwired data sources introduced.

## Self-Check: PASSED

- FOUND: components/workspace/estimate/estimate-document.tsx (price_source includes 'researched')
- FOUND: lib/queries/estimate.ts (price_source includes 'researched')
- FOUND: app/api/estimates/[id]/refine/route.ts (cast includes 'researched')
- FOUND commit: 181e3a3
