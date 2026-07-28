---
phase: 185-paginated-editable-editor-mode
plan: 04
subsystem: ui
tags: [pagination, react-hooks, dnd-kit, vitest, playwright, estimate-editor, requirements-closure]

# Dependency graph
requires:
  - phase: 185-paginated-editable-editor-mode (Plan 01)
    provides: computeEstimatePageConstraints()/createBrowserFontkitMeasurementProvider()/browser-vs-server MeasurementProvider parity test — the shared engine substrate this plan's engine-parity test binds to the live view
  - phase: 185-paginated-editable-editor-mode (Plan 03)
    provides: usePaginatedPreview()/PaginatedDocumentOverlay()/derivePageOffsets() (real DOM-measurement pass) + estimate-document.tsx's data-page-block-id/data-item-id anchors — this plan refines the hook's trigger logic and memoizes the overlay's offset derivation directly
provides:
  - structuralEditEpoch — a reducer-level, exhaustively-classified counter (use-estimate-reducer.ts) distinguishing structural edits (add/remove/reorder item or section, discount/deposit/tax/presentation-settings changes, refinement apply, price-book apply, photo attach/detach) from pure text edits (field/title/item-value updates)
  - usePaginatedPreview()'s immediate-vs-400ms-debounced trigger logic, keyed on structuralEpoch vs. a text-only data reference change
  - PaginatedDocumentOverlay's memoized derivePageOffsets() options bundle (useMemo), avoiding redundant recomputation on unrelated re-renders with the same pages reference
  - paginated-view-engine-parity.test.tsx — the phase's closing integration test binding the engine's direct PageAssignment[] computation to the LIVE rendered usePaginatedPreview+PaginatedDocumentOverlay+EstimateDocument pipeline's decorative sheet count
  - paginated-editing-preserved.test.tsx — focus/key-stability regression proof (a structural edit on an earlier section never remounts or loses focus on a later section's item-row input) + dnd-kit document-order proof (page membership never leaks into DOM/list order)
  - share-webview-pagination-boundary.test.ts — an automated recursive-walk grep guard (static `from` AND dynamic `import(...)` forms) proving app/estimate/[token]/** and components/share/** never import any pagination module
  - REQUIREMENTS.md closure — PGMODE-01..05 and PGBRK-01/04 all flipped to complete, closing the v4.23 milestone's pagination requirement set (POLISH-01 remains for Phase 186)
affects: [186-webview-design-polish (POLISH-01 — the only remaining open v4.23 requirement)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Centralized structural-vs-text classification: structuralDirty() mirrors the existing dirty()/editEpoch pattern exactly (same bump-in-one-place discipline), so a future reducer action defaults to NOT bumping structuralEditEpoch (opt-in, not opt-out) unless explicitly added to the classification"
    - "Effect-cleanup-driven debounce: usePaginatedPreview relies on React's own guarantee that a dependency-array change runs the PREVIOUS effect's cleanup (clearing any pending debounce timer) before the NEW effect body runs — this collapses 'clear pending timer, then decide immediate-vs-debounce' into a single lastStructuralEpochRef comparison, with no manual data-reference bookkeeping"
    - "Recursive directory-walk boundary test (mirrors tests/unit/platform-branding-sweep.test.ts's walk() helper): any FUTURE file added under app/estimate/[token]/ or components/share/ is automatically covered by the import-boundary guard, not just the files that existed at authoring time"

key-files:
  created:
    - tests/unit/workspace/estimate-reducer-structural-epoch.test.ts
    - tests/unit/estimate/use-paginated-preview.test.ts
    - tests/unit/estimate/paginated-view-engine-parity.test.tsx
    - tests/unit/estimate/paginated-editing-preserved.test.tsx
    - tests/unit/estimate/share-webview-pagination-boundary.test.ts
    - .planning/phases/185-paginated-editable-editor-mode/185-HUMAN-UAT.md
  modified:
    - components/workspace/estimate/use-estimate-reducer.ts
    - components/workspace/estimate/estimate-editor.tsx
    - components/workspace/estimate/use-paginated-preview.ts
    - components/workspace/estimate/paginated-document-overlay.tsx
    - tests/unit/estimate/paginated-preview-canvas.test.tsx
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Memoized derivePageOffsets()'s reservation-options argument (offsetsOptions) via useMemo, rather than restructuring the measurement shell into separate measurement-state + memo + write-effect stages — preserves the EXACT synchronous reset-then-snapshot DOM-write timing 185-03's Playwright script verified against real Chromium (re-run clean after this change: all 4 page anchors bind correctly, zero straddling blocks). Recomputation still only happens when `pages` (or the memoized reservations) actually change, since the surrounding useLayoutEffect's own dependency array already gates on both."
  - "usePaginatedPreview's immediate-vs-debounce decision uses ONE ref (lastStructuralEpochRef) rather than tracking a separate lastDataRef: any dependency-array change OTHER than structuralEpoch (data, company, templateId, preparedBy, or language) debounces at 400ms — a strictly safer default than narrowly gating only on `data` reference changes, since it also covers a template/company change without silently dropping it."
  - "ATTACH_PHOTO/DETACH_PHOTO bump structuralEditEpoch directly (not via structuralDirty()), preserving their pre-existing deliberate non-dirty (no isDirty/editEpoch bump) behavior exactly, per this plan's interfaces block."

requirements-completed: [PGMODE-03, PGMODE-05, PGBRK-01, PGBRK-04]

# Metrics
duration: ~35min
completed: 2026-07-28
---

# Phase 185 Plan 04: Structural-Epoch Repagination Triggers + Engine-Parity Closure Summary

**A reducer-level `structuralEditEpoch` counter drives immediate-vs-400ms-debounced repagination in `usePaginatedPreview`, a new integration test binds the LIVE rendered paginated pipeline's sheet count to the engine's direct computation, focus/dnd-kit survive a cross-page structural edit, and a recursive-walk boundary test closes PGMODE-05 — closing PGMODE-01..05 and PGBRK-01/04 in REQUIREMENTS.md.**

## Performance

- **Duration:** ~35 min (estimated — file reads preceded the first commit)
- **Completed:** 2026-07-28
- **Tasks:** 2 completed
- **Files modified:** 12 (6 created, 6 modified)

## Accomplishments

- `structuralEditEpoch: number` added to `EstimateEditorState`, initialized to `0` in both `initState()` branches. A new `structuralDirty()` helper (mirroring the existing `dirty()`/`editEpoch` pattern exactly) bumps it alongside `isDirty`/`editEpoch` on every STRUCTURAL action: `ADD_ITEM`, `REMOVE_ITEM`, `ADD_SECTION`, `REMOVE_SECTION`, `REORDER_ITEMS`, `REORDER_SECTIONS`, `UPDATE_DISCOUNT`, `UPDATE_DEPOSIT`, `UPDATE_TAX_RATE`, `UPDATE_PRESENTATION_SETTINGS`, `APPLY_REFINEMENT`, `APPLY_PRICE_BOOK_ITEM` (12 cases). `ATTACH_PHOTO`/`DETACH_PHOTO` bump `structuralEditEpoch` directly, without touching `isDirty`/`editEpoch` (their existing, deliberate non-dirty behavior, unchanged). `UPDATE_FIELD`/`UPDATE_SECTION_TITLE`/`UPDATE_ITEM`/`MARK_SAVED` are untouched (text-only, never bump it).
- `usePaginatedPreview` widened with a `structuralEpoch: number` input. A `lastStructuralEpochRef` tracks the last epoch this hook recomputed for (including `null` = "never activated" so first activation is always immediate). A change to `structuralEpoch` (or first activation) triggers `recompute()` with zero timer delay; any other dependency change (a pure text edit is the common case) schedules `setTimeout(recompute, TEXT_DEBOUNCE_MS)` where `const TEXT_DEBOUNCE_MS = 400` is a named constant. React's own effect-cleanup-before-rerun guarantee means a pending debounce timer is ALWAYS cleared before the next effect run — so a structural change landing mid-debounce is never masked by the stale timer.
- `estimate-editor.tsx`'s `usePaginatedPreview({...})` call site now threads `structuralEpoch: state.structuralEditEpoch`.
- `PaginatedDocumentOverlay` bundles its reservation inputs (`topReservationPx`/`bottomReservationPx`/`continuationHeaderPx`/`pageGapPx`) into one `useMemo`'d `offsetsOptions` object, feeding both `derivePageOffsets()`'s call and the measurement `useLayoutEffect`'s own dependency array — an unrelated re-render that leaves `pages` and the reservations untouched never re-enters the measurement effect (proven by a new jsdom test spying on the container's own `querySelector`). Re-ran `scripts/pagination-binding-check.ts` against real Chromium after this change — still PASSED (all 4 page anchors bind correctly, zero straddling blocks) — confirming the memoization didn't disturb 185-03's cascade-corrected DOM-write timing.
- `tests/unit/estimate/paginated-view-engine-parity.test.tsx` (Blocker 6 closure) — renders the REAL, non-mocked `usePaginatedPreview` + `PaginatedDocumentOverlay` + `EstimateDocument` pipeline (fontkit's real browser build forced under Node/Vitest via the same `vi.mock('fontkit', ...)` technique as 185-01's parity test, real vendored TTF fonts served via a stubbed `fetch`) against a 4-section/40-item fixture (`buildMultiPageFixtureEstimate()`), and asserts the rendered `[data-page-sheet]` count equals `computePageBreaks()`'s own direct computation for the identical fixture (`tests/unit/pdf/_pages-for-fixture.ts`'s `buildPagesForFixture()`) — for BOTH `classic` and `modern` templates.
- `tests/unit/estimate/paginated-editing-preserved.test.tsx` — a real `useEstimateReducer`-backed test host proves (1) a genuine `ADD_ITEM` dispatch on an EARLIER section never remounts or loses focus on a LATER section's item-row `<input>` (captured via `data-item-id`, DOM-node identity AND `document.activeElement` both asserted before/after), and (2) rendered section-header/item-row DOM order always matches `data.sections`/`section.items`' own array order, regardless of a stub `pages` fixture's page assignment (page membership is a purely-visual overlay concern `EstimateDocument` doesn't even receive as a prop).
- `tests/unit/estimate/share-webview-pagination-boundary.test.ts` — a recursive directory walk (mirroring `platform-branding-sweep.test.ts`'s `walk()` helper) over `app/estimate/[token]/` and `components/share/`, asserting zero files match a STATIC `from '...lib/estimate/pagination...'` (or `paginated-document-overlay`/`use-paginated-preview`) import, AND zero files match the DYNAMIC `import('...')` form of the same three targets.
- `.planning/REQUIREMENTS.md` — `PGMODE-05`, `PGBRK-01`, `PGBRK-04` checkboxes flipped `[ ]` → `[x]` (PGMODE-01..04 were already complete from earlier plans in this phase); the Requirement Coverage Map's `PGBRK-01`/`PGBRK-04`/`PGMODE-05` rows updated from "Partial"/"Pending" to "Complete", citing Phase 185's specific closing tests.
- `.planning/phases/185-paginated-editable-editor-mode/185-HUMAN-UAT.md` created (status: partial) — the phase's 3 Manual-Only Verifications from `185-VALIDATION.md` (real-browser editing feel, real positional binding at scale, the pending owner reference-image comparison), unchecked, awaiting a human pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reducer structural-edit epoch + immediate-vs-debounced repagination triggers + memoized offset derivation** - `2479a3e7` (feat)
2. **Task 2: Engine-parity integration test + focus/dnd-kit regression proof + PGMODE-05 boundary guard + REQUIREMENTS.md closure** - `c0c1fcc8` (test)

**Plan metadata:** committed alongside this SUMMARY (see final commit).

## Files Created/Modified

- `components/workspace/estimate/use-estimate-reducer.ts` - `structuralEditEpoch` field + `structuralDirty()` helper + 12 classified call sites + ATTACH_PHOTO/DETACH_PHOTO direct bumps
- `components/workspace/estimate/estimate-editor.tsx` - threads `structuralEpoch: state.structuralEditEpoch` into `usePaginatedPreview`'s call site
- `components/workspace/estimate/use-paginated-preview.ts` - widened `structuralEpoch` input, immediate-vs-`TEXT_DEBOUNCE_MS`(400)-debounced trigger logic
- `components/workspace/estimate/paginated-document-overlay.tsx` - `offsetsOptions` useMemo bundle feeding `derivePageOffsets()` + the measurement effect's own dependency array
- `tests/unit/estimate/paginated-preview-canvas.test.tsx` - added a memoization regression test (spy on the container's own `querySelector` across a same-`pages`-reference re-render)
- `.planning/REQUIREMENTS.md` - PGMODE-05/PGBRK-01/PGBRK-04 checkboxes + coverage-map rows flipped to complete
- `tests/unit/workspace/estimate-reducer-structural-epoch.test.ts` - exhaustive per-action structuralEditEpoch classification proof
- `tests/unit/estimate/use-paginated-preview.test.ts` - immediate-vs-debounce trigger-timing proof (mocked browser-estimator + spied `computePageBreaks`, `vi.advanceTimersByTimeAsync`)
- `tests/unit/estimate/paginated-view-engine-parity.test.tsx` - engine-parity integration test (Blocker 6 closure)
- `tests/unit/estimate/paginated-editing-preserved.test.tsx` - focus/key-stability + dnd-kit document-order proof
- `tests/unit/estimate/share-webview-pagination-boundary.test.ts` - static + dynamic import boundary guard for the public share webview
- `.planning/phases/185-paginated-editable-editor-mode/185-HUMAN-UAT.md` - phase-level manual-UAT checklist (status: partial)

## Decisions Made

See `key-decisions` in the frontmatter above (memoization approach, single-ref debounce-gating design, ATTACH_PHOTO/DETACH_PHOTO's direct-bump exception).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a memoization regression test not enumerated in the plan's `files_modified`**
- **Found during:** Task 1 (memoized offset derivation)
- **Issue:** The plan's `<behavior>`/`<done>` criteria explicitly require proving "re-rendering `PaginatedDocumentOverlay` with the SAME `pages` array reference does not recompute offsets", but neither Task 1's `<acceptance_criteria>` nor its `<files>` list wired an automated check for this specific claim (the two new test files it lists target the reducer and the hook, not the overlay component).
- **Fix:** Added one new test to the existing `tests/unit/estimate/paginated-preview-canvas.test.tsx` (185-03's file), spying on the measurement container's own `querySelector` (the first DOM read `measureAndApply` performs) across a same-`pages`-reference re-render, proving the effect never re-enters.
- **Files modified:** `tests/unit/estimate/paginated-preview-canvas.test.tsx`
- **Verification:** `npx vitest run tests/unit/estimate/paginated-preview-canvas.test.tsx` — 6/6 pass (5 pre-existing + 1 new)
- **Committed in:** `2479a3e7` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical test coverage)
**Impact on plan:** Closes a verification gap for behavior the plan explicitly described but didn't wire an automated check for. No scope creep — confined to one additional test in an already-touched-by-this-phase file.

## Issues Encountered

None.

## Known Stubs

None. Every field/prop this plan introduces or reads (`structuralEditEpoch`, `structuralEpoch`, `offsetsOptions`) is wired to real production call sites (`estimate-editor.tsx`'s reducer/hook call site) — no hardcoded empty values, no placeholder text, no unwired mock data in production code. Test-only fixtures (multi-page estimate, stub `PageAssignment[]`) are scoped to their own test files, as is standard.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 185 and the v4.23 milestone's entire pagination requirement set (`PGBRK-01..05`, `PGMODE-01..05`) are now COMPLETE in `.planning/REQUIREMENTS.md`. The only remaining open v4.23 requirement is `POLISH-01` (webview design polish), mapped to Phase 186.
- `.planning/phases/185-paginated-editable-editor-mode/185-HUMAN-UAT.md` is created (status: partial) — a human should walk through its 3 items (real-browser editing feel, real positional binding at scale on a genuine estimate, and the pending owner reference-image comparison once supplied) before treating the phase as fully human-verified.
- No blockers for Phase 186.

---
*Phase: 185-paginated-editable-editor-mode*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 6 created files verified present on disk (`estimate-reducer-structural-epoch.test.ts`, `use-paginated-preview.test.ts`, `paginated-view-engine-parity.test.tsx`, `paginated-editing-preserved.test.tsx`, `share-webview-pagination-boundary.test.ts`, `185-HUMAN-UAT.md`), plus this SUMMARY.md. Both task commits (`2479a3e7`, `c0c1fcc8`) verified present in `git log`.
