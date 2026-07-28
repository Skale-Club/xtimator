---
phase: 184-consolidated-pagination-engine
plan: 01
subsystem: pdf-pagination
tags: [fontkit, linebreak, playwright, chromium, pagination, react-pdf, tokens]

# Dependency graph
requires:
  - phase: 182-shared-document-engine
    provides: "lib/estimate/document/ (model.ts, tokens.ts, LETTER page geometry, ESTIMATE_DESIGN_TOKENS)"
  - phase: 183-pdf-parity-content
    provides: "public/fonts/{inter,lora}/*.ttf vendored + registered once in lib/pdf/register-fonts.ts; live estimate-pdf.tsx/estimate-pdf-modern.tsx StyleSheets this plan's geometry numbers are read from"
provides:
  - "fontkit@2.0.4 / linebreak@1.1.0 promoted from transitive to direct dependencies + @types/fontkit dev dependency"
  - "Hand-calculated arithmetic test validating the fontkit layout()/advanceWidth scale formula against the real vendored Inter-Regular.ttf"
  - "Real browser-vs-fontkit measurement-drift spike (scripts/pagination-drift-spike.ts) + committed drift report with GO decision"
  - "SAFETY_MARGIN_LINES = 1, a zero-dependency constant with stated per-page-reserve application semantics"
  - "LINE_HEIGHT (Inter/Inter-Bold 1.21, Lora/Lora-Bold 1.28) + ESTIMATE_PAGE_GEOMETRY (per-template content width/padding/font-size/proseLineHeightMultiplier) + photosPerRow(contentWidthPt) in lib/estimate/document/tokens.ts"
  - "visibleSectionItems(section) in lib/estimate/document/visible-items.ts — the one canonical empty-description filter"
affects: [184-02-pagination-engine, 184-03-estimator-blocks-from-model, 184-04-pdf-template-restructure, 184-05-render-wiring-dispatcher]

# Tech tracking
tech-stack:
  added: [fontkit@2.0.4 (direct dep), linebreak@1.1.0 (direct dep), "@types/fontkit@2.0.9 (dev dep)"]
  patterns:
    - "Measurement-drift spike: standalone tsx script launching Playwright chromium directly (no playwright.config.ts/dev server) to compare real DOM text layout against a server-side glyph-metric estimator, before trusting the estimator for pagination decisions"
    - "Single shared token module (lib/estimate/document/tokens.ts) as the ONE source for font-metrics, page geometry, and layout-chunking formulas — no per-plan re-derivation"
    - "Safety margin applied as a flat per-page pt reserve (not per-block) to avoid compounding measurement uncertainty across a text-dense page"

key-files:
  created:
    - tests/unit/pagination/measure/fontkit-arithmetic.test.ts
    - scripts/pagination-drift-spike.ts
    - lib/estimate/pagination/measure/safety-margin.ts
    - tests/unit/pagination/measure/safety-margin.test.ts
    - .planning/phases/184-consolidated-pagination-engine/184-DRIFT-REPORT.md
    - lib/estimate/document/visible-items.ts
    - tests/unit/estimate/pagination-tokens.test.ts
  modified:
    - package.json
    - package-lock.json
    - lib/estimate/document/tokens.ts

key-decisions:
  - "SAFETY_MARGIN_LINES = 1, derived from a real Chromium-vs-fontkit spike (4/5 samples zero drift; 'single-long-token' showed |drift|=1) — applied as a FLAT PER-PAGE pt reserve (PageConstraints.safetyMarginPt), never added per-block, to avoid over-conservative pagination on text-dense pages while still bounding worst-case underflow"
  - "photosPerRow lives in lib/estimate/document/tokens.ts, NOT components/pdf/*, so the client-safe pagination core (blocks-from-model.ts, Plan 184-03) never needs to import from components/pdf/*"
  - "fontkit's ESM build has no default export (only named exports) — import as `import * as fontkit from 'fontkit'`, not `import fontkit from 'fontkit'` (the latter resolves to undefined under Vite/Vitest's ESM resolution); linebreak's ESM build DOES have a real default export, so `import LineBreaker from 'linebreak'` is correct as-is"

requirements-completed: [PGBRK-05]

# Metrics
duration: 21min
completed: 2026-07-28
---

# Phase 184 Plan 01: Consolidated Pagination Engine Foundations Summary

**Real Chromium-vs-fontkit drift spike (4/5 samples zero drift) yields SAFETY_MARGIN_LINES=1 applied as a per-page pt reserve, plus a shared LINE_HEIGHT/ESTIMATE_PAGE_GEOMETRY/photosPerRow/visibleSectionItems token module every downstream Plan 184-02..05 reads from.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-07-28T10:05:00Z
- **Completed:** 2026-07-28T10:26:35Z
- **Tasks:** 3
- **Files modified:** 10 (7 created, 3 modified)

## Accomplishments
- Promoted `fontkit`/`linebreak` from transitive to direct `dependencies`, added `@types/fontkit` dev dependency, and hand-validated the `layout()`/`advanceWidth` scale formula against the real vendored `Inter-Regular.ttf` (7/7 assertions).
- Built and ran `scripts/pagination-drift-spike.ts` — a standalone Playwright script launching Chromium directly (no dev server, no `playwright.config.ts` coupling) — to measure REAL browser DOM line-wrapping vs. the fontkit+linebreak estimator for 5 representative estimate-description samples, using the same vendored TTF both sides.
- Real spike result: 4 of 5 samples show zero drift; the one non-zero case (`single-long-token`, an unbroken URL) shows `|drift| = 1`. Recorded a GO decision with full verbatim `console.table` output and explicit "Margin Application Semantics" in `184-DRIFT-REPORT.md`.
- Exported `SAFETY_MARGIN_LINES = 1` from a zero-dependency constant file (`lib/estimate/pagination/measure/safety-margin.ts`), citing the drift report and stating it is applied as a flat PER-PAGE pt reserve, never per-block.
- Extended the existing `lib/estimate/document/tokens.ts` with `LINE_HEIGHT` (font-metrics multiplier for `tableCellText`/`sectionTitle`), `ESTIMATE_PAGE_GEOMETRY` (per-template content width/padding/font-size/`proseLineHeightMultiplier`), and `photosPerRow` (relocated here from `components/pdf/shared/pdf-photo-grid.tsx` to keep the client-safe pagination core free of `components/pdf/*` imports).
- Created `lib/estimate/document/visible-items.ts` exporting `visibleSectionItems(section)` — the one canonical empty-description filter, mirroring `estimate-pdf.tsx`'s existing inline filter.

## Task Commits

Each task was committed atomically:

1. **Task 1: Promote fontkit/linebreak to direct dependencies + hand-calculated arithmetic proof** - `e74466aa` (chore)
2. **Task 2: Browser-vs-fontkit drift spike + SAFETY_MARGIN_LINES with stated application semantics** - `767ceb7a` (feat)
3. **Task 3: LINE_HEIGHT + ESTIMATE_PAGE_GEOMETRY + photosPerRow tokens, and visibleSectionItems** - `ece31751` (feat)

**Plan metadata:** committed separately (see below).

## Files Created/Modified
- `package.json` / `package-lock.json` - `fontkit@2.0.4`/`linebreak@1.1.0` promoted to direct `dependencies`; `@types/fontkit@2.0.9` added to `devDependencies`
- `tests/unit/pagination/measure/fontkit-arithmetic.test.ts` - hand-calculated validation of the fontkit line-packer formula against the real vendored Inter TTF (7 assertions)
- `scripts/pagination-drift-spike.ts` - standalone `npx tsx`-runnable spike: launches Chromium directly, compares real DOM `Range.getClientRects()` line counts vs. the fontkit+linebreak estimator for 5 representative samples
- `lib/estimate/pagination/measure/safety-margin.ts` - `export const SAFETY_MARGIN_LINES = 1`, zero imports, citing the drift report
- `tests/unit/pagination/measure/safety-margin.test.ts` - asserts the constant is a valid non-negative integer and the source file stays import-free
- `.planning/phases/184-consolidated-pagination-engine/184-DRIFT-REPORT.md` - verbatim spike output, GO decision, Margin Application Semantics
- `lib/estimate/document/tokens.ts` - added `LINE_HEIGHT`, `EstimatePageGeometry` interface, `ESTIMATE_PAGE_GEOMETRY`, `photosPerRow()`
- `lib/estimate/document/visible-items.ts` - new `visibleSectionItems(section)`
- `tests/unit/estimate/pagination-tokens.test.ts` - 17 assertions covering every value in the plan's `<behavior>` block

## Decisions Made
- `SAFETY_MARGIN_LINES = 1`, applied as a flat per-page pt reserve (not per-block) — see `key-decisions` above and `184-DRIFT-REPORT.md`'s "Margin Application Semantics" section for full rationale.
- `photosPerRow` placed in `lib/estimate/document/tokens.ts` (not `components/pdf/*`) per the plan's Plan-checker blocker 1 requirement, preserving the client-safe/react-pdf-free import boundary for `lib/estimate/pagination/blocks-from-model.ts` (Plan 184-03).
- `fontkit` must be imported as `import * as fontkit from 'fontkit'` (namespace import), not a default import — its ESM build (`dist/module.mjs`) exports only named bindings (`openSync`, `open`, `create`, etc.), no `default`. Confirmed empirically while writing Task 1's test (a default import resolved to `undefined` under Vitest/Vite's ESM module resolution). `linebreak`'s ESM build does export a real `default`, so `import LineBreaker from 'linebreak'` needed no change from the plan's sketch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] fontkit import style corrected from the plan/research sketch's default import**
- **Found during:** Task 1 (arithmetic test) — the plan's `<known_facts>` and 184-RESEARCH.md's code sketches both show `import fontkit from 'fontkit'`, which fails at runtime under this repo's Vitest/Vite ESM resolution (`fontkit`'s `.mjs` builds export no `default`).
- **Issue:** `fontkit.openSync is not a function` / `Cannot read properties of undefined (reading 'openSync')` when running the test with a default import.
- **Fix:** Changed to `import * as fontkit from 'fontkit'` in both `tests/unit/pagination/measure/fontkit-arithmetic.test.ts` and `scripts/pagination-drift-spike.ts`. Verified via `node -e` that `require('fontkit')` and the namespace import produce the same shape (`openSync`, `open`, `create`, `registerFormat`, `logErrors`, `defaultLanguage`, `setDefaultLanguage`).
- **Files modified:** `tests/unit/pagination/measure/fontkit-arithmetic.test.ts`, `scripts/pagination-drift-spike.ts`
- **Verification:** `npx vitest run tests/unit/pagination/measure/fontkit-arithmetic.test.ts` — 7/7 pass; spike script ran end-to-end producing real Chromium measurements.
- **Committed in:** `e74466aa` (Task 1), `767ceb7a` (Task 2)

---

**Total deviations:** 1 auto-fixed (1 bug — import-style correction needed for the plan's own reference sketch to actually run).
**Impact on plan:** Zero scope creep — the fix is a one-line import-statement correction required to execute the plan's own hand-verified formula; all target numbers, file locations, and exports match the plan exactly.

## Issues Encountered
None beyond the fontkit import fix documented above.

## User Setup Required
None - no external service configuration required. (Playwright Chromium was already installed in this environment; no new install step was needed.)

## Next Phase Readiness
- `SAFETY_MARGIN_LINES`, `LINE_HEIGHT`, `ESTIMATE_PAGE_GEOMETRY`, `photosPerRow`, and `visibleSectionItems` are all committed and test-covered — Plan 184-02 (engine) can build `PageConstraints.safetyMarginPt` from `SAFETY_MARGIN_LINES` immediately; Plan 184-03 (estimator/blocks-from-model) can import `photosPerRow`/`visibleSectionItems`/`LINE_HEIGHT` directly; Plan 184-04 (template restructure) can import `ESTIMATE_PAGE_GEOMETRY`/`photosPerRow`.
- No blockers. `fontkit`/`linebreak` direct-dependency promotion, the arithmetic proof, and the drift spike are all real, verified, and committed — nothing here needs revisiting before Plan 184-02 starts.

---
*Phase: 184-consolidated-pagination-engine*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 8 created files confirmed present on disk (`tests/unit/pagination/measure/fontkit-arithmetic.test.ts`, `scripts/pagination-drift-spike.ts`, `lib/estimate/pagination/measure/safety-margin.ts`, `tests/unit/pagination/measure/safety-margin.test.ts`, `.planning/phases/184-consolidated-pagination-engine/184-DRIFT-REPORT.md`, `lib/estimate/document/visible-items.ts`, `tests/unit/estimate/pagination-tokens.test.ts`, this SUMMARY.md). All 3 task commits confirmed present in `git log` (`e74466aa`, `767ceb7a`, `ece31751`).
