---
phase: 183-pdf-parity-content
plan: 01
subsystem: testing
tags: [react-pdf, vitest, fixtures, regression-anchor, wave-0]

# Dependency graph
requires:
  - phase: 182-shared-document-engine-send-path-fix
    provides: "lib/estimate/document/{model,labels,format,tokens}.ts shared engine; formatDate local-midnight fix; presentation-settings resolver already wired into both PDF templates"
provides:
  - "tests/unit/estimate/fixtures/document-fixtures.ts — one shared fixture module (FIXTURE_COMPANY, buildFixtureEstimate, toFixtureDocumentData, TINY_PNG_DATA_URL, SIGNATURE_FIXTURE, PHOTO_WITH_CAPTION, PHOTO_NO_CAPTION) reusable by every later 183 test (PDF-direct-call AND webview RTL styles)"
  - "tests/unit/pdf/estimate-pdf-baseline-order.test.tsx — committed pre-refactor text-content order assertions for both Classic and Modern PDF templates"
affects: [183-04, 183-05, 183-06, 183-07, signature-block, photo-captions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared fixture module pattern: one Record<string, unknown>-typed buildFixtureEstimate()/toFixtureDocumentData() pair, zero framework imports, consumed identically by PDF-direct-call tests (EstimateWithSections shape) and RTL webview tests (EstimateDocumentData shape)"
    - "Baseline-order regression test: call PDF function components directly (no renderToBuffer), walk the element tree with the shared _pdf-text-walker collectTextNodes, assert relative order via indexOf/lastIndexOf/findIndex rather than full-array toEqual"

key-files:
  created:
    - tests/unit/estimate/fixtures/document-fixtures.ts
    - tests/unit/pdf/estimate-pdf-baseline-order.test.tsx
  modified: []

key-decisions:
  - "buildFixtureEstimate's money fields (subtotal 1500, discount_amount 150, tax_amount 111.38, total 1461.38, balance_due 1022.97) are computed explicitly by hand in a doc comment — no import from the totals engine, per the plan's explicit constraint."
  - "Discount/Tax totals-row labels render with a percentage suffix ('Discount (10%)', 'Tax (8.25%)'), so the baseline test matches them via findIndex(t => t.startsWith(...)) instead of exact-string indexOf — the plan's milestone list named the bare labels but the actual rendered text includes the suffix for a discount_type:'percentage' + tax_rate>0 fixture."
  - "toFixtureDocumentData omits importing PresentationSettings/DocumentPhoto types (unlike the pattern it mirrors) to keep the fixture module at zero imports of any kind, not just zero React/react-pdf imports — simpler and still satisfies the acceptance criteria."

requirements-completed: [PDFPAR-01, PDFPAR-02, PDFPAR-03, ENGINE-03]

# Metrics
duration: 12min
completed: 2026-07-28
---

# Phase 183 Plan 01: Wave-0 Fixtures + Pre-Refactor Baseline Summary

**Shared EstimateWithSections/EstimateDocumentData fixture builder plus a committed pre-refactor text-order test for both PDF templates, giving Wave 2/3's structural recomposition a concrete regression anchor.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-28T06:48:00Z (approx.)
- **Completed:** 2026-07-28T07:00:13Z
- **Tasks:** 2
- **Files modified:** 2 (both newly created)

## Accomplishments
- Created `tests/unit/estimate/fixtures/document-fixtures.ts`: a zero-framework-import fixture module exporting `FIXTURE_COMPANY`, `buildFixtureEstimate()`, `toFixtureDocumentData()`, `TINY_PNG_DATA_URL`, `SIGNATURE_FIXTURE` (date-only `signedAt`), `PHOTO_WITH_CAPTION`, and `PHOTO_NO_CAPTION` — importable from both PDF-direct-call tests and webview RTL tests without pulling in either rendering stack.
- Created `tests/unit/pdf/estimate-pdf-baseline-order.test.tsx`, which calls `EstimatePDF`/`EstimatePDFModern` directly, walks the returned element tree with the existing shared `_pdf-text-walker`, and locks in today's text-content order (company name → ESTIMATE title → Project → no Bill To → Labor → Materials → Subtotal → Discount → Tax → grand Total → Deposit → Balance Due → Payment Terms → Warranty) for both templates.
- Both new files verified standalone (isolated `tsc` for the fixture module; `vitest run` for the baseline test) — no production code was touched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared document fixture module** - `a54d9845` (test)
2. **Task 2: Pre-refactor PDF text-order baseline (Wave-0 regression anchor)** - `88d46290` (test)

_No plan-metadata amend commit yet — this commit follows in the same step as this SUMMARY._

## Files Created/Modified
- `tests/unit/estimate/fixtures/document-fixtures.ts` - Shared fixture builders/constants (company, estimate, signature, captioned photos) for reuse by every later Phase 183 test
- `tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` - Pre-refactor text-node-order assertions for Classic + Modern PDF templates (the Wave-0 regression anchor)

## Decisions Made
- Computed all fixture money fields (subtotal/discount/tax/total/balance_due) explicitly by hand with a doc comment showing the arithmetic, per the plan's explicit "do not rely on any engine import" instruction.
- Matched the Discount/Tax totals rows by `startsWith` prefix rather than exact string, since those two labels render with a percentage suffix in the actual JSX (`'Discount (10%)'`, `'Tax (8.25%)'`) — an implementation detail not spelled out character-for-character in the plan's milestone list, resolved by reading the current template JSX during `<read_first>`.
- Kept `toFixtureDocumentData()` free of any type imports (not just React/react-pdf) to maximize the "zero dependency" property the plan calls for.

## Deviations from Plan

None - plan executed exactly as written. The Discount/Tax label-matching adjustment above is an implementation detail within the task's own acceptance criteria (order-based assertions), not a deviation from any read_first/action instruction — the plan explicitly said to use `.indexOf()`/`.lastIndexOf()` comparisons rather than `toEqual`, and `.findIndex()` with a prefix predicate is the same family of comparison, required because the actual rendered strings include a percentage suffix.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `tests/unit/estimate/fixtures/document-fixtures.ts` is ready for Plan 183-02 (signature block) and later plans (photo captions) to import instead of re-declaring fixtures.
- `tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` is ready for Plan 183-07 to extend with the intentional post-refactor order once Waves 2/3 land.
- No blockers. Note for the orchestrator: this plan ran in parallel with 183-02 (signature query/PDF resolver work) and 183-03 (font vendoring/registration) — `git status` during execution showed those plans' in-flight changes to `components/pdf/*`, `lib/pdf/*`, and `lib/estimate/document/tokens.ts`; only this plan's own two new files were staged/committed here.
- **Requirements NOT marked complete in REQUIREMENTS.md.** This plan's frontmatter lists `[PDFPAR-01, PDFPAR-02, PDFPAR-03, ENGINE-03]` (copied verbatim above per the summary template), but Phase 183 has 7 plans total and this is Wave-0 groundwork only (fixtures + a regression-anchor test, zero production code touched) — PDFPAR-01/02/03 remain genuinely "Pending" in REQUIREMENTS.md's traceability table until the structural PDF recomposition and signature/caption features actually land in later 183 waves. Running `gsd-tools requirements mark-complete` here would have falsely flipped those checkboxes to done; deferring that call to whichever later 183 plan actually ships each requirement.

## Self-Check: PASSED

- FOUND: tests/unit/estimate/fixtures/document-fixtures.ts
- FOUND: tests/unit/pdf/estimate-pdf-baseline-order.test.tsx
- FOUND: commit a54d9845 (test(183-01): add shared document fixture module)
- FOUND: commit 88d46290 (test(183-01): lock pre-refactor PDF text-content order)

---
*Phase: 183-pdf-parity-content*
*Completed: 2026-07-28*
