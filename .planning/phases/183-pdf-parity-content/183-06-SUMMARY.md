---
phase: 183-pdf-parity-content
plan: 06
subsystem: pdf
tags: [react-pdf, refactor, de-duplication, signature, photo-captions, discount-display]

# Dependency graph
requires:
  - phase: 183-pdf-parity-content
    provides: "Plan 183-04's components/pdf/shared/* (PdfHeader/PdfInfoGrid/PdfFooter/PdfTitleBanner/PdfSectionBlock/PdfTermsSection) and the direct-function-invocation wiring pattern this plan follows for its 3 new shared components"
  - phase: 183-pdf-parity-content
    provides: "Plan 183-02's signature prop threading (EstimatePdfContext.signature, renderEstimatePdf's createElement) and isPercentageDiscount predicate (lib/estimate/discount-display.ts)"
provides:
  - "components/pdf/shared/pdf-totals-block.tsx — variant='classic'|'modern' totals renderer preserving Classic's boxed grand-total row vs Modern's standalone hero total; shared isPercentageDiscount predicate replacing the last 2 inline '=== percentage' checks (PDF side)"
  - "components/pdf/shared/pdf-photo-grid.tsx — shared photo grid with per-photo caption text (PDFPAR-03, PDF side)"
  - "components/pdf/shared/pdf-signature-block.tsx — net-new signature-display block (PDFPAR-02), data-presence gated, positioned between Terms and Photos on both PDF templates"
  - "EstimatePDFProps.signature — the real, permanent field on both estimate-pdf.tsx and estimate-pdf-modern.tsx (Plan 183-02 deliberately deferred this; the render-estimate-pdf.ts type-cast workaround is now removed)"
  - "Both PDF templates now fully compose components/pdf/shared/* for every region — ENGINE-03 structurally complete"
affects: [184-consolidated-pagination-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PdfTotalsBlock: one component, one `variant: 'classic' | 'modern'` prop branching to two genuinely different JSX trees (Pitfall 2) — not a single tree parameterized by style tokens"
    - "PdfPhotoGrid: takes an explicit `topMargin: number` prop instead of hardcoding one margin value, preserving each template's pre-existing outer-wrapper spacing exactly (Classic 16, Modern 20) through the extraction"
    - "PdfSignatureBlock: `if (!signature) return null` gate, `wrap={false}` atomic block — matches the webview's Plan 183-05 Terms->Signature->Photos placement and Phase 184's 'unsplittable block' expectation"
    - "Continued 183-04's direct-function-invocation convention (`{PdfTotalsBlock({...})}`, `PdfPhotoGrid({...})`, `{PdfSignatureBlock({...})}`) for all 3 new shared components, required for the baseline-order test's tree walker"

key-files:
  created:
    - components/pdf/shared/pdf-totals-block.tsx
    - components/pdf/shared/pdf-photo-grid.tsx
    - components/pdf/shared/pdf-signature-block.tsx
    - tests/unit/pdf/estimate-pdf-signature.test.tsx
    - tests/unit/pdf/estimate-pdf-modern-signature.test.tsx
    - tests/unit/pdf/estimate-pdf-photo-captions.test.tsx
    - .planning/phases/183-pdf-parity-content/deferred-items.md
  modified:
    - components/pdf/estimate-pdf.tsx
    - components/pdf/estimate-pdf-modern.tsx
    - lib/pdf/render-estimate-pdf.ts

key-decisions:
  - "PdfTotalsBlock's styles prop is one flat interface (not a discriminated union) with grandTotalRow/grandTotalBlock both optional, satisfying the plan's literal `variant: 'classic' | 'modern'` grep check while keeping each variant's branch referencing only its own optional style field."
  - "PdfPhotoGrid accepts a required `topMargin: number` prop (16 for Classic, 20 for Modern) rather than the plan's minimal `{photos, L, styles: {termsTitle}}` prop list — this is the one existing per-template spacing difference in the pre-refactor photo grid, and hardcoding a single value would have silently regressed Modern's spacing by 4pt."
  - "Cleaned up lib/pdf/render-estimate-pdf.ts's ComponentType-widening cast (and its now-unused `ComponentType`/`EstimatePDFProps` type imports) now that EstimatePDFProps declares `signature` for real — this file was explicitly listed in the plan's own files_modified as the natural place for this cleanup."

requirements-completed: [PDFPAR-01, PDFPAR-02, PDFPAR-03, ENGINE-03]

# Metrics
duration: 18min
completed: 2026-07-28
---

# Phase 183 Plan 06: PDF Totals/Photo/Signature Shared Components Summary

**Extracted PdfTotalsBlock (Classic boxed row-list vs Modern standalone hero, both branches preserved verbatim), added PdfPhotoGrid captions, and built a net-new PdfSignatureBlock wired into both PDF templates via the real `EstimatePDFProps.signature` field — closing ENGINE-03's structural de-duplication and landing PDFPAR-02/03 on the last 2 of 4 document surfaces.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-28T03:38:00-04:00 (approx.)
- **Completed:** 2026-07-28T03:55:50-04:00
- **Tasks:** 2 completed
- **Files modified:** 10 (7 created, 3 modified)

## Accomplishments
- Created `components/pdf/shared/pdf-totals-block.tsx` — `variant='classic'|'modern'` branch reproducing each template's totals JSX exactly (Classic's bordered `grandTotalRow` vs Modern's standalone `grandTotalBlock`, Modern's deposit-row-before-hero-total order preserved), with the shared `isPercentageDiscount` predicate replacing both templates' last remaining inline `discount_type === 'percentage'` checks
- Created `components/pdf/shared/pdf-photo-grid.tsx` — each photo now wraps in its own `View` with a conditional caption `<Text>` beneath it; a `topMargin` prop preserves Classic's 16 vs Modern's 20 outer-wrapper spacing exactly
- Created `components/pdf/shared/pdf-signature-block.tsx` — net-new, gated purely on `signature` presence (no placeholder when unsigned), `wrap={false}` atomic block, mounted between the shared `PdfTermsSection` and the photo-grid conditional in both templates
- Added the real, permanent `signature?: DocumentSignature | null` field to `EstimatePDFProps` in both `estimate-pdf.tsx` and `estimate-pdf-modern.tsx` (Plan 183-02 deliberately deferred this) and removed the now-unnecessary `ComponentType`-widening cast in `lib/pdf/render-estimate-pdf.ts`
- Both PDF templates now compose ALL 9 `components/pdf/shared/*` components (`PdfHeader`/`PdfInfoGrid`/`PdfFooter`/`PdfTitleBanner`/`PdfSectionBlock`/`PdfTermsSection`/`PdfTotalsBlock`/`PdfPhotoGrid`/`PdfSignatureBlock`) — ENGINE-03 structurally complete
- Added `tests/unit/pdf/estimate-pdf-signature.test.tsx` (Classic — includes a real `renderToBuffer` smoke test with a genuine base64 PNG, closing 183-RESEARCH.md's "no live render test was performed" caveat), `estimate-pdf-modern-signature.test.tsx` (Modern), and `estimate-pdf-photo-captions.test.tsx` (both templates, `describe.each`)
- Kept the Plan 183-01 baseline-order regression test green throughout; full suite (572 files / 4702 passed, 21 todo, 1 skipped) green; scoped `tsc -p tsconfig.ci.json --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: PdfTotalsBlock (classic/modern variant) with isPercentageDiscount — extract and wire** - `bea0c8d0` (feat)
2. **Task 2: PdfPhotoGrid (captions) + PdfSignatureBlock (net-new) — build and wire** - `155172e7` (feat)

_No TDD RED/GREEN split — these are extract-and-wire tasks per the plan's `type="auto" tdd="true"` designation applied as build-then-verify, matching Plan 183-04's precedent (no pre-existing failing-test step made sense for a pure extraction with new coverage added alongside)._

## Files Created/Modified
- `components/pdf/shared/pdf-totals-block.tsx` - Variant-branched totals renderer; shared `isPercentageDiscount` predicate
- `components/pdf/shared/pdf-photo-grid.tsx` - Shared photo grid with per-photo caption text and a `topMargin` prop
- `components/pdf/shared/pdf-signature-block.tsx` - Net-new signature-display block, `if (!signature) return null` gated
- `components/pdf/estimate-pdf.tsx` - Classic template: added `signature` prop/field, wired `PdfTotalsBlock`/`PdfPhotoGrid`/`PdfSignatureBlock`, removed now-unused `Image` import
- `components/pdf/estimate-pdf-modern.tsx` - Modern template: same wiring as Classic, its own `topMargin`/`variant` values
- `lib/pdf/render-estimate-pdf.ts` - Removed the `ComponentType`-widening cast (and its now-dead `ComponentType`/`EstimatePDFProps` imports) now that `EstimatePDFProps.signature` is real
- `tests/unit/pdf/estimate-pdf-signature.test.tsx` - Classic signature-block coverage + `renderToBuffer` smoke test
- `tests/unit/pdf/estimate-pdf-modern-signature.test.tsx` - Modern signature-block coverage
- `tests/unit/pdf/estimate-pdf-photo-captions.test.tsx` - Caption presence/absence coverage, both templates
- `.planning/phases/183-pdf-parity-content/deferred-items.md` - Logged pre-existing, out-of-scope bare-`tsc` test-type drift (see Deviations)

## Decisions Made
- `PdfTotalsBlock`'s `styles` prop stays one flat interface with `grandTotalRow`/`grandTotalBlock` both optional (not a discriminated union) — satisfies the plan's literal `variant: 'classic' | 'modern'` grep check while each branch only ever reads its own field
- `PdfPhotoGrid` takes an explicit `topMargin: number` prop (16 Classic / 20 Modern) rather than hardcoding a single value, preserving the one real pre-existing spacing difference between templates
- Reused the established 183-04 direct-function-invocation pattern for all 3 new shared components (no JSX call sites), keeping the baseline-order test's tree walker fully resolving every region

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved Modern's photo-grid outer marginTop (20) via a `topMargin` prop instead of the plan's literal minimal prop list**
- **Found during:** Task 2 (`PdfPhotoGrid` build)
- **Issue:** The plan's literal prop signature (`{ photos; L; styles: { termsTitle } }`) omits the outer wrapper's marginTop, but the pre-refactor JSX has a real per-template difference here — Classic's `{ marginTop: 16 }` vs Modern's `{ marginTop: 20 }`. Following the plan's literal prop list verbatim would have silently regressed Modern's spacing to 16.
- **Fix:** Added a required `topMargin: number` prop to `PdfPhotoGridProps`, passed as `16` from `estimate-pdf.tsx` and `20` from `estimate-pdf-modern.tsx` — byte-identical spacing preserved for both templates.
- **Files modified:** components/pdf/shared/pdf-photo-grid.tsx, components/pdf/estimate-pdf.tsx, components/pdf/estimate-pdf-modern.tsx
- **Verification:** No spacing-assertion test exists for this value, but the change is a pure prop-threading addition with zero behavior change from the pre-refactor JSX — confirmed by re-reading both templates' original marginTop values before extraction
- **Committed in:** 155172e7 (Task 2 commit)

**2. [Rule 1 - Bug] Removed the now-unnecessary `ComponentType`-widening cast in `lib/pdf/render-estimate-pdf.ts`**
- **Found during:** Task 2 (adding the real `signature` field to `EstimatePDFProps`)
- **Issue:** `render-estimate-pdf.ts`'s `createElement` call used `PDFComponent as ComponentType<EstimatePDFProps & { signature?: DocumentSignature | null }>` — a workaround Plan 183-02 introduced specifically because `EstimatePDFProps` didn't yet declare `signature`. This plan makes `signature` a real field on both templates, so the cast (and its `ComponentType`/`EstimatePDFProps` type imports) became dead code.
- **Fix:** Simplified to a plain `createElement(PDFComponent, {...})` call; removed the now-unused `ComponentType` import from `react` and the now-unused `EstimatePDFProps` type import from `estimate-pdf.tsx`.
- **Files modified:** lib/pdf/render-estimate-pdf.ts
- **Verification:** `npx tsc -p tsconfig.ci.json --noEmit` clean; `tests/unit/pdf/render-estimate-pdf-resolver.test.ts` still green (this file is explicitly listed in the plan's own `files_modified`)
- **Committed in:** 155172e7 (Task 2 commit)

**3. [Deferred — not fixed] Logged pre-existing bare-`tsc` test-type drift, out of scope**
- **Found during:** Task 2's tsc verification pass (bare `npx tsc --noEmit`, not the CI-scoped `tsconfig.ci.json` gate)
- **Issue:** Bare `tsc --noEmit` (whole-repo, includes `tests/**`) surfaces pre-existing type errors in `tests/e2e/demo-session-isolation.spec.ts`, `tests/unit/demo/ai-estimate-route-boundaries.test.ts`, `tests/unit/demo/billing-route-boundaries.test.ts`, `tests/unit/demo/service-funnel-boundaries.test.ts`, and `tests/unit/pdf/render-estimate-pdf-resolver.test.ts` (a mocked snapshot-row fixture missing `signer_name`/`signature_data`). Confirmed via `git stash`/`git stash pop` that every one of these pre-exists independently of this plan's changes.
- **Fix:** None applied — out of scope per the scope-boundary rule (not caused by this plan's changes; `tsconfig.ci.json`, the actual CI gate, excludes `tests/**` and is clean). Logged to `.planning/phases/183-pdf-parity-content/deferred-items.md` for follow-up.
- **Files modified:** .planning/phases/183-pdf-parity-content/deferred-items.md (log only)
- **Committed in:** (to be committed with this plan's docs commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bug/dead-code avoidance), 1 logged-and-deferred (out of scope, not fixed)
**Impact on plan:** Both auto-fixes were necessary to avoid silently regressing existing behavior (Modern's photo-grid spacing) or leaving dead code referencing a workaround this plan itself makes obsolete. The deferred item is unrelated to this plan's file scope and does not block ENGINE-03/PDFPAR-01/02/03 completion.

## Issues Encountered

None — both tasks' acceptance criteria and verify commands passed after the initial implementation; a `git stash`/`git stash pop` round-trip (used to confirm the pre-existing-vs-introduced status of bare-tsc errors) was cleanly reversible with no data loss.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both PDF templates (`estimate-pdf.tsx`, `estimate-pdf-modern.tsx`) are now thin compositions over `components/pdf/shared/*` for every region — ENGINE-03 is structurally complete across both webview (Plan 183-05) and PDF (this plan) surfaces
- PDFPAR-01 (discount-suffix predicate), PDFPAR-02 (signature block), and PDFPAR-03 (photo captions) are now landed on all 4 document surfaces (2 webview + 2 PDF)
- Phase 184 (consolidated pagination engine) can build on `PdfSignatureBlock`'s `wrap={false}` atomic-block treatment as its defined "unsplittable" signature unit
- One pre-existing, unrelated bare-`tsc` test-type drift item logged in `.planning/phases/183-pdf-parity-content/deferred-items.md` for a future quick/debug task (does not block this phase)

---
*Phase: 183-pdf-parity-content*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 10 key files verified present on disk (3 shared components, 3 new tests, 1 deferred-items log, 3 modified templates/resolver — see below). Both commits (`bea0c8d0`, `155172e7`) verified present in `git log`. Final `npx tsc -p tsconfig.ci.json --noEmit` exits 0; final `npx vitest run tests/unit tests/eval` is 572 files / 4702 passed (21 todo, 1 skipped).
