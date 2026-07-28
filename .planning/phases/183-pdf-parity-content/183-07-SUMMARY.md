---
phase: 183-pdf-parity-content
plan: 07
subsystem: testing
tags: [react-pdf, react-testing-library, vitest, signature, photo-captions, cross-surface-parity, regression-baseline]

# Dependency graph
requires:
  - phase: 183-pdf-parity-content
    provides: "Plan 183-01's tests/unit/estimate/fixtures/document-fixtures.ts (buildFixtureEstimate/toFixtureDocumentData/SIGNATURE_FIXTURE/PHOTO_WITH_CAPTION/PHOTO_NO_CAPTION) and its Wave-0 pre-refactor baseline-order test"
  - phase: 183-pdf-parity-content
    provides: "Plan 183-05's webview signature block (EstimateDocument/EstimateDocumentModern data.signature) and Plan 183-06's PDF signature block (EstimatePDFProps.signature) — the 4 surfaces this plan cross-checks for consistency"
provides:
  - "tests/unit/estimate/document-signature-caption-cross-surface.test.tsx — the definitive 4-surface (Classic PDF, Modern PDF, Classic webview, Modern webview) signature + caption parity proof for PDFPAR-02/03, driven by ONE shared fixture"
  - "tests/unit/pdf/estimate-pdf-baseline-order.test.tsx extended with 4 new post-refactor order assertions, explicitly distinguished from the original pre-refactor assertions via an updated header comment"
  - ".planning/phases/183-pdf-parity-content/183-HUMAN-UAT.md — durable UAT record replacing the interactive human-verify checkpoint (auto-approved under this project's yolo-mode policy)"
affects: [184-consolidated-pagination-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-surface parity test pattern (mirrors presentation-settings-cross-surface.test.tsx): ONE shared fixture object, N render calls (2 direct PDF-function invocations walked via collectTextNodes, 2 RTL renders read via container.textContent), ONE assertion block comparing all outputs for the same fact (signer name, formatted signed date, caption text)"
    - "Intentional-baseline-extension pattern: a Wave-0 regression-anchor test file is EXTENDED (not replaced) with new `it` blocks plus an explicit header-comment note distinguishing 'this is an intentional new assertion' from 'this is a silently tolerated regression' — the header comment and the new assertions coexist with the untouched pre-refactor assertions in the same describe block"
    - "Durable-UAT-over-interactive-checkpoint pattern: a checkpoint:human-verify's `<how-to-verify>` content is persisted verbatim into a phase-scoped {phase}-HUMAN-UAT.md (YAML frontmatter + numbered Tests + Summary + Gaps) before auto-approving, so yolo-mode auto-approval always leaves a durable, greppable record instead of silently vanishing"

key-files:
  created:
    - tests/unit/estimate/document-signature-caption-cross-surface.test.tsx
    - .planning/phases/183-pdf-parity-content/183-HUMAN-UAT.md
  modified:
    - tests/unit/pdf/estimate-pdf-baseline-order.test.tsx

key-decisions:
  - "Reformatted the cross-surface test's Classic/Modern webview render() calls onto single-line JSX (matching the plan's literal sketch prop order) rather than the initial multi-line JSX, so the acceptance-criteria grep for 'EstimateDocument '/'EstimateDocumentModern' matches the actual usage lines directly, not just the import statements."
  - "Split the plan's 2 stated post-refactor assertions (signer-between-Terms-and-Photos; caption-after-Photos-label) into 2 separate helper functions (assertSignatureBetweenTermsAndPhotos, assertCaptionAfterPhotosLabel) instead of one combined helper, so each of the 4 new `it` blocks (2 per template) maps to exactly one assertion with no redundant re-checking."
  - "183-HUMAN-UAT.md's status stays 'partial' with all 4 entries genuinely [pending] — auto-approval under yolo mode logs the checkpoint as passed for workflow-continuation purposes, but the UAT file itself does not claim a human actually looked, per this project's own documented policy that auto-approval must not be conflated with real visual verification."

requirements-completed: [PDFPAR-01, PDFPAR-02, PDFPAR-03, ENGINE-03]

# Metrics
duration: 20min
completed: 2026-07-28
---

# Phase 183 Plan 07: Cross-Surface Signature/Caption Parity + Baseline Extension Summary

**One shared-fixture-driven test proves signer name, formatted signed date, and photo caption text agree across all 4 document surfaces (Classic PDF, Modern PDF, Classic webview, Modern webview); the Wave-0 pre-refactor baseline test is deliberately extended (not left stale) with 4 new post-refactor order assertions; full 572-file/4709-test suite and CI-scoped typecheck stay green; the phase's one human-verify checkpoint is auto-approved under yolo mode and persisted to 183-HUMAN-UAT.md as a durable, still-pending record.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-28T08:00:00Z (approx.)
- **Completed:** 2026-07-28T08:11:42Z
- **Tasks:** 3 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Created `tests/unit/estimate/document-signature-caption-cross-surface.test.tsx`: one shared fixture (`buildFixtureEstimate({ signature: SIGNATURE_FIXTURE, attachedPhotos: [PHOTO_WITH_CAPTION, PHOTO_NO_CAPTION] })`) drives Classic PDF (direct call + `collectTextNodes`), Modern PDF (same), Classic webview (RTL `render`), and Modern webview (RTL `render`) — asserting signer name, `formatDate(SIGNATURE_FIXTURE.signedAt, 'en')`, and caption text all appear consistently on every surface, that the caption appears exactly once (not duplicated onto the uncaptioned photo), that an unsigned/caption-less fixture shows the signature on NONE of the 4 surfaces, and a structural grep that all 4 source files reference `signature`
- Extended `tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` (same file, same `describe` block, per its own header comment's stated intent) with 4 new `it` blocks (2 per template): signer name strictly between `'Warranty'` and `'Photos'`, and the caption text after the `'Photos'` label — while leaving the 2 original pre-refactor `it` blocks and their `assertBaselineOrder` helper completely untouched
- Created `.planning/phases/183-pdf-parity-content/183-HUMAN-UAT.md` persisting all 4 required verification entries (spacing/typography fidelity, Modern hairline/fill-free negative check, real-PDF signature-image render, and the verbatim OWNER DECISION line re-confirming Correction 1's Classic-only-banner scope) as a durable record ahead of the checkpoint's auto-approval
- Ran the full repo gate: `npx vitest run tests/unit tests/eval` — 572 files / 1 skipped, 4709 tests passed / 21 todo; `npx tsc -p tsconfig.ci.json --noEmit` — clean; narrowed discount-suffix grep (`components/pdf components/share components/workspace/estimate/estimate-document.tsx`) — zero matches, confirming the DISPLAY-predicate swap is complete on all 4 call sites without touching the intentionally-untouched TOTALS-MATH call site in `use-estimate-reducer.ts:220`

## Task Commits

Each task was committed atomically:

1. **Task 1: 4-surface signature + caption parity test** - `1c2312b1` (test)
2. **Task 2: Intentionally extend the Wave-0 baseline to the post-refactor structure** - `4630f952` (test)
3. **Task 3: Manual visual verification checkpoint — persisted as durable UAT** - `7f6c54aa` (docs)

**Plan metadata:** (this commit, made after this SUMMARY)

_No TDD RED/GREEN split — all 3 tasks are test-authoring/documentation tasks against already-implemented (Plans 183-04/05/06) behavior; each task's own test run served as its GREEN verification._

## Files Created/Modified
- `tests/unit/estimate/document-signature-caption-cross-surface.test.tsx` - New: the 4-surface signature/caption parity test (PDFPAR-02/03's definitive cross-surface proof)
- `tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` - Extended with 4 new post-refactor `it` blocks + explicit "EXTENDED in Plan 183-07" header comment; original 2 pre-refactor `it` blocks unchanged
- `.planning/phases/183-pdf-parity-content/183-HUMAN-UAT.md` - New: durable UAT record for the phase's one human-verify checkpoint, `status: partial`, all 4 entries `[pending]`

## Decisions Made
- Reformatted the cross-surface test's webview `render()` calls to single-line JSX (matching the plan's literal sketch) so the acceptance-criteria grep matches the real usage line, not only the import statement
- Split the plan's 2 stated post-refactor assertions into 2 separate helper functions rather than one combined helper, keeping each new `it` block mapped to exactly one assertion
- Kept 183-HUMAN-UAT.md's `status: partial` and all 4 `result: [pending]` — auto-approval advances the workflow but the durable record itself does not overclaim a human visual check occurred

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all 3 tasks' acceptance criteria and verify commands passed on first implementation; the full-suite and typecheck gates were green without any additional fixes needed.

## User Setup Required

None - no external service configuration required.

## Authentication Gates

None encountered.

## Checkpoint Handling

Task 3 (`checkpoint:human-verify`, gate="blocking") was auto-approved per this project's standing yolo-mode policy (human-verify checkpoints are auto-approved and persisted as durable UAT records rather than blocking execution). `.planning/phases/183-pdf-parity-content/183-HUMAN-UAT.md` was created with all 4 required entries — including the verbatim OWNER DECISION line about Correction 1's Classic-only banner scope — BEFORE logging the auto-approval, per the plan's own instruction that the file must exist "before presenting the checkpoint to the human." Execution continued to completion without pausing.

⚡ Auto-approved checkpoint (yolo) — items persisted to 183-HUMAN-UAT.md

## Next Phase Readiness

- Phase 183 (PDF Parity + Content) is now fully closed: all 7 plans complete, all 4 requirements (PDFPAR-01, PDFPAR-02, PDFPAR-03, ENGINE-03) proven consistent across all 4 document surfaces by this plan's cross-surface test
- The Wave-0 baseline-order regression anchor now documents BOTH the pre-refactor order (unchanged) and the intentional post-refactor order (signature/caption), so a future contributor cannot mistake either for silent drift
- `183-HUMAN-UAT.md` remains genuinely pending real human eyes on the downloaded PDFs and the Correction 1 scope confirmation — surface this file to the project owner at the next natural checkpoint (e.g. before Phase 184 kicks off, since 184 builds directly on `PdfSignatureBlock`'s atomic-block treatment)
- Ready for `/gsd:verify-work` on Phase 183, then Phase 184 (consolidated pagination engine)

---
*Phase: 183-pdf-parity-content*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 3 key files verified present on disk (`tests/unit/estimate/document-signature-caption-cross-surface.test.tsx`, `tests/unit/pdf/estimate-pdf-baseline-order.test.tsx`, `.planning/phases/183-pdf-parity-content/183-HUMAN-UAT.md`). All 3 commits (`1c2312b1`, `4630f952`, `7f6c54aa`) verified present in `git log`. Final `npx vitest run tests/unit tests/eval` is 572 files / 4709 passed (1 skipped, 21 todo). Final `npx tsc -p tsconfig.ci.json --noEmit` exits clean. Narrowed discount-suffix grep returns zero matches.
