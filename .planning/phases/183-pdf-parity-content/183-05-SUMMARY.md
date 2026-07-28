---
phase: 183-pdf-parity-content
plan: 05
subsystem: ui
tags: [react, tailwind, vitest, react-testing-library, estimate-document]

# Dependency graph
requires:
  - phase: 183-pdf-parity-content
    provides: "Plan 183-02's DocumentSignature type, signedBy label, isPercentageDiscount predicate, and signature threaded onto ShareEstimateData/EstimateWithSections"
provides:
  - "Classic webview (estimate-document.tsx, both share-page view mode and workspace-editor view mode) renders the signature block (image + signer name + signed date) between Terms and Photos, gated only on data.signature presence"
  - "Modern webview (estimate-document-modern.tsx, share page) renders the same signature block in the same relative position"
  - "Both webview photo grids render a conditional caption paragraph beneath each thumbnail (AttachedPhotoThumb rewrap + Modern's inline grid-cell rewrap)"
  - "Both webview templates' discount-suffix display now calls isPercentageDiscount instead of an inline === 'percentage' check (closes the webview half of PDFPAR-01)"
  - "EstimateEditorState/stateToDocumentData thread signature: DocumentSignature | null from the server row into the workspace editor's document data"
  - "estimate-view.tsx threads signerName/signedAt/signatureImageDataUrl from the (183-02-widened) ShareEstimateData into documentData.signature for both template renders"
affects: [183-06-pdf-signature-photo-captions, 183-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Data-presence-only gating for the signature block (no presentation_settings key) — mirrors the CONTEXT.md-locked rule that unsigned estimates render no placeholder"
    - "AttachedPhotoThumb/Modern grid-cell wrap pattern: outer plain <div> now wraps the pre-existing aspect-square image div UNCHANGED, plus a sibling conditional caption <p>, avoiding any diff inside the untouched image/skeleton/remove-button JSX"

key-files:
  created:
    - tests/unit/estimate/document-signature-view.test.tsx
    - tests/unit/estimate/document-photo-captions-view.test.tsx
  modified:
    - components/workspace/estimate/estimate-document.tsx
    - components/workspace/estimate/use-estimate-reducer.ts
    - components/workspace/estimate/estimate-editor.tsx
    - components/share/estimate-document-modern.tsx
    - components/share/estimate-view.tsx

key-decisions:
  - "Signature block placement: Terms -> Signature -> Photos on both templates, matching the plan's exact JSX (Classic: rounded card-less bordered block; Modern: same plain hairline-border idiom as its surrounding Terms block)"
  - "estimate-view.tsx guards documentData.signature on BOTH signerName AND signatureImageDataUrl being non-null (never trusts partial presence), with signedAt falling back to responded_at then created_at — mirrors render-estimate-pdf.ts's same-shape guard from Plan 183-02"
  - "use-estimate-reducer.ts:220's totals-math discount_type === 'percentage' branch left untouched per the plan's explicit out-of-scope exclusion (GUARD-03/SAVE-07 territory, not a display-suffix decision)"

patterns-established:
  - "Webview signature/caption RTL test convention: toFixtureDocumentData(buildFixtureEstimate({...})) cast to EstimateDocumentData, rendered via both EstimateDocument (mode='view') and EstimateDocumentModern, date assertions always computed via formatDate(fixture.signedAt, 'en') rather than hardcoded strings"

requirements-completed: [PDFPAR-01, PDFPAR-02, PDFPAR-03]

# Metrics
duration: 12min
completed: 2026-07-28
---

# Phase 183 Plan 05: Webview Signature Block + Photo Captions Summary

**Wired the signature-display block and conditional photo captions into both webview document templates (Classic `estimate-document.tsx` and Modern `estimate-document-modern.tsx`), threaded the signature field through the workspace-editor reducer and the share-page loader, and closed the webview half of the discount-suffix fragmentation by swapping both templates onto the shared `isPercentageDiscount` predicate.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-28T07:07:00Z (approx)
- **Completed:** 2026-07-28T07:19:00Z
- **Tasks:** 3
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- Signature block (signature image + signer name + `formatDate`-formatted signed date) inserted between Terms and Photos on both Classic and Modern webview templates, gated purely on `data.signature` presence — no placeholder for unsigned estimates
- `AttachedPhotoThumb` (Classic) and the Modern photo-grid cell both rewrapped to add a conditional caption paragraph below the thumbnail, with the pre-existing image/skeleton/remove-button JSX left byte-identical
- Both templates' discount-suffix display swapped from the inline `=== 'percentage'` check to the shared `isPercentageDiscount()` predicate — zero remaining inline checks in either file
- `EstimateEditorState` gained a `signature: DocumentSignature | null` field (both `initState` branches), and `estimate-editor.tsx`'s `stateToDocumentData` threads it through, completing the workspace-editor's read-only signature display path
- `estimate-view.tsx`'s `documentData` construction now threads `estimate.signerName`/`signedAt`/`signatureImageDataUrl` into a guarded `signature` object feeding both Classic and Modern share-page renders
- 6 new RTL tests across 2 new files covering signed/unsigned and captioned/uncaptioned cases on both templates, with the signed-date assertion always computed via `formatDate(SIGNATURE_FIXTURE.signedAt, 'en')`

## Task Commits

Each task was committed atomically:

1. **Task 1: Classic webview — signature block + photo captions + discount predicate + editor-state threading** - `69faedf3` (feat)
2. **Task 2: Modern webview — signature block + photo captions + discount predicate + share-page data threading** - `70869d93` (feat)
3. **Task 3: Webview signature + caption tests (both templates, both cases)** - `6accec8c` (test)

## Files Created/Modified
- `components/workspace/estimate/estimate-document.tsx` - Signature block (Terms→Signature→Photos), `AttachedPhotoThumb` caption rewrap, `isPercentageDiscount` swap
- `components/workspace/estimate/use-estimate-reducer.ts` - `signature: DocumentSignature | null` on `EstimateEditorState`, both `initState` branches
- `components/workspace/estimate/estimate-editor.tsx` - `stateToDocumentData` threads `signature: state.signature`
- `components/share/estimate-document-modern.tsx` - Signature block, photo-grid caption rewrap, `isPercentageDiscount` swap
- `components/share/estimate-view.tsx` - `documentData.signature` built from the (183-02-widened) share-query fields, guarded on both signerName and signatureImageDataUrl
- `tests/unit/estimate/document-signature-view.test.tsx` - New: signed/unsigned coverage, DOM-order assertion (Terms → Signature → Photos), both templates
- `tests/unit/estimate/document-photo-captions-view.test.tsx` - New: captioned/uncaptioned coverage, both templates

## Decisions Made
- Followed the plan's exact JSX for both signature blocks (Classic's rounded/bordered idiom vs. Modern's plain hairline-border idiom matching its surrounding Terms block)
- `estimate-view.tsx`'s signature guard requires BOTH `signerName` and `signatureImageDataUrl` non-null before building the signature object, with `signedAt` falling back through `responded_at` then `created_at` — mirrors the same-shape guard Plan 183-02 established in `render-estimate-pdf.ts`
- Left `use-estimate-reducer.ts:220`'s totals-math `discount_type === 'percentage'` branch untouched, per the plan's explicit, confirmed-live-in-source exclusion (it is the client-preview totals recompute, not a display-suffix decision)

## Deviations from Plan

None - plan executed exactly as written. All 5 file edits, both JSX insertions, and both new test files matched the plan's `<action>`/`<interfaces>` blocks verbatim; all acceptance-criteria greps and task-level `<verify>` commands passed on the first attempt.

## Issues Encountered

None. Both per-task `<verify>` runs (webview/workspace-scoped, per this plan's Wave-2 boundary note) and the plan's own overall `<verification>` block (`tests/unit/estimate tests/unit/workspace tests/unit/share-query.test.ts`, 513 tests passed) were green throughout, including while Plan 183-04 concurrently committed its `components/pdf/shared/*` extraction in the same wave (file-disjoint, no collisions observed). No whole-repo `tsc` was run in this plan, per the plan's explicit Wave-2 boundary note — that is deferred to the orchestrator's wave-2 boundary gate after both 183-04 and 183-05 complete.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 4 document surfaces now have signature-block coverage started: both webview templates (this plan) are complete; Plan 183-06 covers the 2 PDF templates using the same `DocumentSignature`/`isPercentageDiscount` primitives from Plan 183-02.
- The webview half of PDFPAR-01's discount-suffix fragmentation fix is closed; Plan 183-06 closes the PDF half.
- No blockers. Ready for Plan 183-06, and for the orchestrator's wave-2 boundary gate (full-suite + whole-repo `tsc`) once both 183-04 and 183-05 are complete.

---
*Phase: 183-pdf-parity-content*
*Completed: 2026-07-28*

## Self-Check: PASSED

- FOUND: tests/unit/estimate/document-signature-view.test.tsx
- FOUND: tests/unit/estimate/document-photo-captions-view.test.tsx
- FOUND: .planning/phases/183-pdf-parity-content/183-05-SUMMARY.md
- FOUND commit: 69faedf3 (Task 1)
- FOUND commit: 70869d93 (Task 2)
- FOUND commit: 6accec8c (Task 3)
