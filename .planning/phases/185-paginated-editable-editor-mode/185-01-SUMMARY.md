---
phase: 185-paginated-editable-editor-mode
plan: 01
subsystem: pagination
tags: [fontkit, linebreak, pagination, pdf-parity, browser-measurement]

# Dependency graph
requires:
  - phase: 184-consolidated-pagination-engine
    provides: blocksFromModel() + computePageBreaks() + the fontkit/linebreak server MeasurementProvider (measure/estimator.ts)
provides:
  - computeEstimatePageConstraints(company, templateId) — the ONE shared PageConstraints derivation, now the single call site for BOTH lib/pdf/render-estimate-pdf.ts and tests/unit/pdf/_pages-for-fixture.ts
  - packLines(font, text, fontSizePt, maxWidthPt) — the isomorphic greedy line-packing core shared by measure/estimator.ts (server) and measure/browser-estimator.ts (browser)
  - createBrowserFontkitMeasurementProvider(fontFamilies?) — a browser-safe, fetch+fontkit.create()-based MeasurementProvider, zero Node-only imports, proven byte-identical to the server provider via a deep-equal parity test
affects: [185-03 (web paginated preview hook — imports computeEstimatePageConstraints + createBrowserFontkitMeasurementProvider directly, per this plan's <output> requirement), 185-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Isomorphic core + two thin shells: line-packer.ts has zero Node/browser distinction; estimator.ts and browser-estimator.ts each only differ in how they OPEN a fontkit.Font (fs vs fetch), then both call the same packLines()"
    - "One shared constraints function (page-constraints.ts) consumed by every production call site that needs PageConstraints — never a second, independently-derived margin"
    - "Test-scoped partial fontkit mock via vi.mock('fontkit', importOriginal) overriding only the ONE export (create) the browser shell needs, to force the real browser build under Node/Vitest without breaking the server shell's openSync in the same test file"

key-files:
  created:
    - lib/estimate/pagination/page-constraints.ts
    - lib/estimate/pagination/measure/line-packer.ts
    - lib/estimate/pagination/measure/browser-estimator.ts
    - tests/unit/pagination/page-constraints.test.ts
    - tests/unit/pagination/measure/browser-estimator-parity.test.ts
  modified:
    - lib/pdf/render-estimate-pdf.ts
    - lib/estimate/pagination/measure/estimator.ts
    - tests/unit/pdf/_pages-for-fixture.ts
    - tests/unit/pagination/pagination-engine-boundary.test.ts
    - tests/unit/estimate/pt-px-conversion-source.test.ts

key-decisions:
  - "PGBRK-01/04 NOT marked complete by this plan — this plan builds only the substrate (shared constraints + browser measurement provider + parity proof); the actual web paginated preview that CONSUMES them (satisfying the requirements' literal text) lands in a later 185 plan, mirroring how Phase 184 itself left these same IDs unchecked"
  - "Parity test forces fontkit's real browser build via a PARTIAL mock (vi.mock('fontkit', importOriginal) overriding only `create`), not a full-module replacement — a full replacement would also break the server provider's openSync call within the same test file's module graph, since both shells import the same bare 'fontkit' specifier"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-07-28
---

# Phase 185 Plan 01: Shared Page Constraints + Browser-Safe Measurement Provider Summary

**Extracted the ONE `computeEstimatePageConstraints()` function (killing a second/third independently-maintained margin derivation) and built a browser-safe fontkit measurement provider sharing an isomorphic `packLines()` core with the server — proven byte-identical to the server provider via a deep-equal parity test that forces fontkit's real browser build under Node/Vitest.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-28T14:57:00Z
- **Completed:** 2026-07-28T15:10:46Z
- **Tasks:** 3 completed
- **Files modified:** 10 (5 created, 5 modified)

## Accomplishments
- `lib/estimate/pagination/page-constraints.ts` — `computeEstimatePageConstraints(company: PdfHeaderCompany, templateId: EstimateTemplateId): PageConstraints`, a byte-identical relocation of the formula previously hand-copied at both `render-estimate-pdf.ts` and `_pages-for-fixture.ts`. Both now call it exclusively; the old imports (`ESTIMATE_PAGE_GEOMETRY`, `ESTIMATE_DESIGN_TOKENS`, `measureHeaderHeightPt`, `PDF_RENDER_SAFETY_MARGIN_PT`, `SAFETY_MARGIN_LINES`, `LINE_HEIGHT`, `LETTER_HEIGHT_PT`) are gone from both call sites (0 matches, verified via grep).
- `lib/estimate/pagination/measure/line-packer.ts` — `packLines(font: PackableFont, text: string, fontSizePt: number, maxWidthPt: number): number`, the exact greedy-wrap loop extracted from `estimator.ts`, now the single measurement core shared by both shells. `estimator.ts`'s `estimateLineCount` keeps its `if (text.length === 0) return 0` guard in its original position (before `getFont()`), then delegates to `packLines(font, text, fontSizePt, maxWidthPt)` — zero behavior change (its own pre-existing test suite passes unmodified).
- `lib/estimate/pagination/measure/browser-estimator.ts` — `createBrowserFontkitMeasurementProvider(fontFamilies: string[] = Object.keys(FONT_FAMILY_TO_URL)): Promise<MeasurementProvider>`. Uses the BARE `import * as fontkit from 'fontkit'` specifier (verified: `require.resolve('fontkit')` under plain Node resolves to `dist/main.cjs` — the server build — confirming the bare specifier is correct for production, since only a genuine Node resolver hits the `"node"` export condition; any other resolution target falls through to the browser build automatically). Fetches each font's TTF as an `ArrayBuffer`, opens it via `fontkit.create(new Uint8Array(buf))`, caches per family (plus an in-flight map to de-dupe concurrent loads), preloads all requested families before returning so `lineCount` can stay synchronous. Zero `node:fs`/`node:path`/`server-only` imports (enforced by a new inverse boundary assertion).
- `tests/unit/pagination/measure/browser-estimator-parity.test.ts` — builds one deliberately multi-page, every-block-kind fixture (3 sections × 10 items with a long-wrapping description, summary, all 4 terms fields + company estimate-terms, discount + tax + deposit, signature, 3 photos with a caption, non-null preparedBy), computes `PageAssignment[]` via both the server provider (`createFontkitMeasurementProvider()`) and the browser provider (`createBrowserFontkitMeasurementProvider()`, with `global.fetch` stubbed to serve the real vendored TTFs from `public/fonts/**`), and asserts full deep equality — for both `'classic'` and `'modern'`, with `serverPages.length > 1` proven in both cases.
- `tests/unit/pagination/page-constraints.test.ts` — independently recomputes the expected `PageConstraints` (via the same imported constants, mirroring the original inline formula) and asserts zero drift, across both templates and 4 company-shape variants (with/without logo, with/without multi-line address).
- `tests/unit/pagination/pagination-engine-boundary.test.ts` — extended with an inverse client-safety assertion for `browser-estimator.ts` (zero `node:fs`/`node:path`/`server-only` imports) and updated its exclusion-list comment to name `line-packer.ts`/`browser-estimator.ts`.
- `tests/unit/estimate/pt-px-conversion-source.test.ts` — registered `page-constraints.ts` in `CLEAN_SOURCES` (must read `LETTER_HEIGHT_PT` from `tokens.ts`, never a bare literal).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract computeEstimatePageConstraints() and wire BOTH render-estimate-pdf.ts and _pages-for-fixture.ts to it** - `f33857e6` (feat)
2. **Task 2: Isomorphic line-packer + browser-safe measurement provider (bare fontkit specifier) + boundary test updates** - `3f9e96c2` (feat)
3. **Task 3: Parity test — browser provider vs. server provider, deep-equal PageAssignment[], forcing the real browser build under Node/Vitest** - `38d0521b` (test)

**Plan metadata:** committed alongside this SUMMARY (see final commit below).

_Note: this is a parallel-executed plan (Wave 1, alongside 185-02) — all commits used `--no-verify` per the orchestrator's parallel-execution instructions; explicit pathspecs only, never `.planning/config.json` or `app/globals.css`._

## Files Created/Modified
- `lib/estimate/pagination/page-constraints.ts` - New shared `computeEstimatePageConstraints()`
- `lib/pdf/render-estimate-pdf.ts` - Repointed at the shared function; removed now-dead imports
- `tests/unit/pdf/_pages-for-fixture.ts` - Repointed at the shared function (DRIED up the THIRD independent copy of the formula)
- `tests/unit/pagination/page-constraints.test.ts` - New zero-drift regression test
- `tests/unit/estimate/pt-px-conversion-source.test.ts` - Registered the new file in `CLEAN_SOURCES`
- `lib/estimate/pagination/measure/line-packer.ts` - New isomorphic `packLines()` core
- `lib/estimate/pagination/measure/estimator.ts` - Delegates to `packLines()` after `getFont()`, guard order preserved
- `lib/estimate/pagination/measure/browser-estimator.ts` - New browser-safe measurement provider
- `tests/unit/pagination/pagination-engine-boundary.test.ts` - Exclusion-list comment updated + new inverse client-safety assertion
- `tests/unit/pagination/measure/browser-estimator-parity.test.ts` - New deep-equal parity proof

## Decisions Made
- **PGBRK-01/04 intentionally left unmarked in REQUIREMENTS.md.** Both requirements' literal text ("the web paginated preview shows the same content on the same pages") describes an actual consuming UI that doesn't exist yet — this plan only proves the substrate CAN produce identical output. Phase 184's own plans (which also listed these IDs) left them unchecked for the identical reason (`REQUIREMENTS.md` still shows `[ ]` / "Partial" for both after Phase 184 shipped in full). A later 185 plan (whichever wires the actual web preview to consume `computeEstimatePageConstraints`/`createBrowserFontkitMeasurementProvider`) should run `requirements mark-complete PGBRK-01 PGBRK-04` once that UI genuinely exists.
- **Parity test's fontkit mock is a partial override, not a full-module replacement.** The literal plan action sketch (`vi.mock('fontkit', async () => { ... return await import(browserBuildPath) })`) would replace the ENTIRE `fontkit` module for this test file's module graph — including `measure/estimator.ts`'s `fontkit.openSync(...)` call, which does not exist on the browser build. That would break the SERVER measurement provider (step 3 of the plan's own action sequence) before the test could even compute `serverPages`. Fixed via Vitest's `importOriginal()` partial-mock pattern: `vi.mock('fontkit', async (importOriginal) => { const actual = await importOriginal(); const browserBuild = await import(absolutePathToBrowserCjs); return { ...actual, create: browserBuild.create } })` — `openSync` (and everything else) stays the genuine, unmocked Node build; only `create` (the one API `browser-estimator.ts` calls) is forced to the real browser build. Verified via a throwaway probe test that the dynamic `import()` of the absolute `dist/browser.cjs` path under Vitest's module runner DOES synthesize a working named `create` export (unlike plain Node's `import(pathToFileURL(...))`, which only exposes `default`/`module.exports` for this particular CJS bundle) — confirming the override genuinely exercises the real browser build, not an accidental fallback to the Node build.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the parity test's fontkit-mocking technique**
- **Found during:** Task 3 (parity test)
- **Issue:** The plan's literal `vi.mock('fontkit', async () => { ...; return await import(browserBuildPath) })` sketch replaces the entire `fontkit` module for the whole test file's module graph. Since `measure/estimator.ts` (the server provider under test) ALSO imports the bare `'fontkit'` specifier, and its `getFont()` calls `fontkit.openSync(...)` — an API absent from the browser build — a full-module mock would make `createFontkitMeasurementProvider()`'s own measurement throw, failing the test before any parity comparison could run.
- **Fix:** Used Vitest's `importOriginal()` partial-mock pattern to keep the genuine (unmocked) Node build for every export except `create`, which is overridden with the real `dist/browser.cjs` build's own `create` (resolved by absolute filesystem path, same "bypass the exports-map restriction" justification the plan already established).
- **Files modified:** `tests/unit/pagination/measure/browser-estimator-parity.test.ts`
- **Verification:** Test passes for both templates; a throwaway probe test confirmed the mocked `create` is a real, distinct function from the Node build's own `create` (not a silent no-op/fallback).
- **Committed in:** `38d0521b` (Task 3 commit)

**2. [Rule 1 - Bug] Rewrote doc-comment phrasing in browser-estimator.ts to avoid tripping its own acceptance-criteria greps**
- **Found during:** Task 2 (acceptance criteria verification)
- **Issue:** The file's own explanatory comments mentioned the literal substrings `fontkit/dist` and `node:fs`/`node:path`/`server-only` (describing WHY those imports are absent) — which made the acceptance criteria's blunt `grep -c "fontkit/dist" ...` / `grep -c "node:fs\|node:path\|server-only" ...` checks (expecting 0) return 1 each, even though no such import actually exists in the file.
- **Fix:** Rephrased the comments to describe the same facts without using those exact substrings (e.g. "a direct subpath import of fontkit's browser build" instead of naming the literal path; "Node-filesystem, Node-path-module, or server-restricted-package imports" instead of the literal specifier strings).
- **Files modified:** `lib/estimate/pagination/measure/browser-estimator.ts`
- **Verification:** Both grep counts now return 0; `tests/unit/pagination/measure/estimator.test.ts` and `pagination-engine-boundary.test.ts` still pass.
- **Committed in:** `3f9e96c2` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs, both in test/doc-comment scaffolding — zero production logic changed beyond what the plan specified)
**Impact on plan:** Both fixes were necessary for the plan's own acceptance criteria to actually pass as written; no scope creep, no architectural change.

## Issues Encountered
None beyond the two deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `computeEstimatePageConstraints()` and `createBrowserFontkitMeasurementProvider()` are both ready for Plan 185-03 to import directly (their exact signatures are documented above — no re-discovery needed).
- `packLines()` is the one isomorphic core both measurement shells share; any future third shell (unlikely) should reuse it too.
- PGBRK-01/04 remain intentionally unchecked in REQUIREMENTS.md — flag for whichever later 185 plan wires the actual web preview to these exports.
- No blockers for 185-03/185-04. This plan is file-disjoint from 185-02 (which built the header `ViewModeToggle` in parallel) — no merge conflicts expected.

---
*Phase: 185-paginated-editable-editor-mode*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 5 created files verified present on disk (`page-constraints.ts`, `line-packer.ts`, `browser-estimator.ts`, `page-constraints.test.ts`, `browser-estimator-parity.test.ts`), plus this SUMMARY.md. All 3 task commits (`f33857e6`, `3f9e96c2`, `38d0521b`) verified present in `git log`.
