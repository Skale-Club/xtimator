---
phase: 185-paginated-editable-editor-mode
verified: 2026-07-28T16:51:45Z
status: gaps_found
score: 24/25 must-haves verified (5/5 ROADMAP success criteria; 19/20 plan-level truths, 1 partial)
gates:
  typecheck: "npx tsc -p tsconfig.ci.json --noEmit — PASS (exit 0, zero errors)"
  tests: "npx vitest run tests/unit tests/eval — PASS (596 files: 595 passed, 1 skipped; 4912 tests: 4891 passed, 21 todo; 189.50s)"
  phase_tests: "12 phase-185 test files, 74 tests — all green (10.12s)"
  binding_check: "npx tsx scripts/pagination-binding-check.ts — PASSED (real Chromium, 4 page anchors bind within their own sheet, 16/16 blocks non-straddling)"
gaps:
  - truth: "Continuation pages repeat the items-table column header (only where a section's rows actually span a break)"
    status: partial
    reason: "The overlay reserves the correct continuation-header HEIGHT and applies the items-table header's exact styling classes, but renders a self-closing, childless <div> — no Description/Qty/Unit Price/Total labels. The PDF (components/pdf/estimate-pdf.tsx:660, estimate-pdf-modern.tsx:676) renders a REAL repeated header via PdfTableHeaderOnly({ L, ... }). A user on page 2+ of paginated mode therefore sees a blank grey band where the PDF shows real column labels — a visible mirror-fidelity divergence in the phase's headline feature."
    artifacts:
      - path: "components/workspace/estimate/paginated-document-overlay.tsx"
        issue: "Lines 315-321: `{continuesTable && (<div data-testid=\"continuation-header\" className=\"bg-muted/50 text-sm text-muted-foreground border-b border-border/50 select-none\" style={{ height: continuationHeaderPx }} />)}` — styled but empty."
      - path: "tests/unit/estimate/paginated-preview-canvas.test.tsx"
        issue: "Lines 59-73 assert only the PRESENCE/placement of [data-testid=\"continuation-header\"], never its text content — so the empty strip passes the suite."
    missing:
      - "Render the four column labels (L.description / L.qty / L.unitPrice / L.total) inside the continuation-header strip, reusing estimate-document.tsx:597-605 (classic) / 629-634 (modern) column widths so the strip visually matches the real items-table header."
      - "Extend tests/unit/estimate/paginated-preview-canvas.test.tsx's continuation-header test to assert the label text is present (the current test would pass against an empty div)."
      - "Optional (Info): decide whether sheetTopPx should subtract continuationHeaderPx so continuation sheets start at the same `cumulative` coordinate as non-continuation sheets — today the inter-sheet gap on a continuation page is pageGapPx + continuationHeaderPx rather than pageGapPx."
human_verification:
  - test: "Real-browser paginated editing feel (185-HUMAN-UAT.md item 1) — open a large multi-page estimate, toggle paginated, type into a long description, drag-reorder an item and a section, resize the window."
    expected: "No per-keystroke reflow thrash (repagination visibly waits ~400ms after typing stops); drag never fights page membership; canvas scales smoothly; decorative sheets track the real content while scrolling."
    why_human: "jsdom performs no layout and cannot judge timing/visual smoothness."
  - test: "Real positional binding at scale (185-HUMAN-UAT.md item 2) — open a REAL 3+ page estimate (not the Playwright script's synthetic fixture) and toggle paginated mode."
    expected: "Every item/section/totals/terms/signature/photo block sits fully inside its own decorative sheet; no block visually straddles a page boundary."
    why_human: "scripts/pagination-binding-check.ts proves the algorithm on a hardcoded fixture with stand-in reservation constants; real varied content is unproven."
  - test: "Visual match to the pending owner reference image (185-HUMAN-UAT.md item 3)."
    expected: "Paginated canvas matches the owner's reference; [ADJUSTABLE] tokens in 185-UI-SPEC.md adjusted as needed."
    why_human: "The owner has not yet supplied the reference image."
  - test: "Confirm the legacy CSS-zoom REUSE is acceptable (ROADMAP success criterion 4 vs. 185-UI-SPEC.md §4)."
    expected: "estimate-editor.tsx:331-355/761 still carries pageZoom + `style={{ zoom }}` — deliberately repurposed by 185-UI-SPEC.md §4 as the responsive fit-to-viewport scaler, NOT as a view-mode control. Success criterion 4's literal wording (\"its CSS-zoom mechanism no longer appear anywhere in the editor\") is therefore not literally satisfied; its INTENT (exactly one page-view control, in the header) is."
    why_human: "A scope/intent judgement between two phase artifacts, not a code fact."
---

# Phase 185: Paginated Editable Editor Mode — Verification Report

**Phase Goal:** The workspace estimate editor gains a paginated view mode — letter-size pages styled like a PDF preview, mirroring the PDF's page breaks — that stays fully editable, alongside the existing full-width mode, with the legacy width/page toggle retired.
**Verified:** 2026-07-28T16:51:45Z
**Status:** gaps_found (1 partial truth; goal otherwise achieved)
**Re-verification:** No — initial verification

---

## Gates (run by the verifier, real numbers)

| Gate | Command | Result |
|---|---|---|
| CI typecheck | `npx tsc -p tsconfig.ci.json --noEmit` | **PASS** — exit 0, zero errors |
| Full unit + eval suite | `npx vitest run tests/unit tests/eval` | **PASS** — Test Files 595 passed / 1 skipped (596); Tests 4891 passed / 21 todo (4912); 189.50s |
| Phase-185 test files only | `npx vitest run` (12 files listed below) | **PASS** — 12 files, 74 tests, 10.12s |
| Real-browser binding | `npx tsx scripts/pagination-binding-check.ts` | **PASSED** — 4/4 page anchors within their own sheet rect; 16/16 blocks non-straddling |

Binding-check raw output (real Chromium):

```
pageIndex  anchorTop  sheetTop  sheetBottom  withinRange
0          0          -120      1266         true
1          1566       1446      2862         true
2          3012       2892      4308         true
3          4458       4338      5754         true
pagination-binding-check PASSED: all 4 page anchors bind correctly within their
own decorative sheet, and no block straddles a sheet boundary.
```

Phase test files run individually (all green): `browser-estimator-parity`, `page-constraints`, `derive-page-offsets`, `paginated-view-engine-parity`, `share-webview-pagination-boundary`, `document-prepared-by-terms`, `use-paginated-preview`, `paginated-editing-preserved`, `estimate-reducer-structural-epoch`, `view-mode-toggle`, `paginated-preview-canvas`, `pagination-engine-boundary`.

---

## Goal Achievement

### ROADMAP Success Criteria (the phase contract)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Two icon toggle buttons left of "Edit with AI"; clicking paginated switches to letter-size, PDF-preview-styled pages matching the template's breaks | ✓ VERIFIED | `project-header.tsx:54` mounts `<ViewModeToggle>` between the autosave span and `<EditEstimateHeaderButton>` (line 55). `view-mode-toggle.tsx` matches 185-UI-SPEC.md §1 verbatim. `paginated-view-engine-parity.test.tsx` binds the LIVE rendered sheet count to `computePageBreaks()`'s direct output for both templates. |
| 2 | Inline edit, add/remove items+sections, drag-reorder all work in paginated mode | ✓ VERIFIED | `estimate-editor.tsx:763-793` wraps the SAME `<EstimateDocument mode="edit" …>` tree (not a forked read-only copy) in `<PaginatedDocumentOverlay>`. `paginated-editing-preserved.test.tsx` dispatches a real `ADD_ITEM` through the real reducer inside the overlay and asserts DOM-node identity (`toBe`) + `document.activeElement` survive. |
| 3 | Boundary-crossing edits trigger debounced repagination with no focus/scroll loss and no per-keystroke reflow | ✓ VERIFIED | `use-paginated-preview.ts:146-159` — structural epoch → immediate; otherwise `setTimeout(recompute, 400)`. `use-paginated-preview.test.ts` proves 399ms = 0 calls / 400ms = exactly 1, rapid keystrokes collapse to 1, and a structural change mid-debounce fires immediately AND clears the stale timer. Focus survival proven in `paginated-editing-preserved.test.tsx`. |
| 4 | The old floating-pill "Full page/Full width" toggle and its CSS-zoom mechanism no longer appear in the editor; exactly one page-view control, in the header | ⚠️ VERIFIED WITH DOCUMENTED DEVIATION | Toggle: fully retired — `estimate-floating-actions.tsx` (read end-to-end) has no viewMode props, no File/StretchHorizontal imports, no toggle block; repo-wide grep for `VIEW_MODE_KEY` → 0 hits; `"Full page"` → 3 hits, all comments. No `localStorage` in any editor file. Exactly one control exists (header). **Deviation:** `pageZoom` + `style={{ zoom }}` survive at `estimate-editor.tsx:331-355, 761` — deliberately repurposed as the responsive fit-to-viewport scaler per 185-UI-SPEC.md §4 ("its fit-to-viewport math is **reused**, not deleted outright"). Intent met; literal wording not. Flagged for human sign-off. |
| 5 | The public share webview is unchanged — single-page scroll, same URL, no pagination controls | ✓ VERIFIED | `share-webview-pagination-boundary.test.ts` walks `app/estimate/[token]/**` + `components/share/**` recursively, catching static AND `import(...)` forms, with a non-zero-file sanity guard. `components/share/estimate-view.tsx:319` calls `<EstimateDocument>` with NEITHER `preparedBy` nor `companyTerms`; `document-prepared-by-terms.test.tsx`'s second case renders that exact call pattern and asserts neither new block appears and the 4 pre-existing terms fields keep their content and order. `estimate-document.tsx` imports zero pagination modules (transitive safety confirmed). |

**ROADMAP score: 5/5.**

### Plan-Level Must-Have Truths

| Plan | Truth | Status | Evidence |
|---|---|---|---|
| 01 | Web + PDF derive PageConstraints from exactly ONE shared function | ✓ VERIFIED | `computeEstimatePageConstraints` is the sole derivation for `render-estimate-pdf.ts:200`, `use-paginated-preview.ts:130`, `_pages-for-fixture.ts:54`. Only remaining inline copies are (a) `page-constraints.test.ts:40-42` — the deliberate independent re-derivation drift guard, and (b) `scripts/pagination-render-calibration.ts:393-395` — a margin-SWEEP script that must vary `extraMarginPt` by design. |
| 01 | Browser provider produces IDENTICAL `PageAssignment[]` to the server provider | ✓ VERIFIED | `browser-estimator-parity.test.ts` forces fontkit's real browser build via absolute-path `vi.mock` (`importOriginal` preserves the server build's `openSync`), builds a 3-section × 10-item, every-block-kind fixture, asserts `serverPages.length > 1`, then `expect(browserPages).toEqual(serverPages)` for BOTH templates. Verified non-vacuous: `node_modules/fontkit/dist/browser.cjs` exists (566 KB) and exports `create: function`, `openSync: undefined` — genuinely a different code path. |
| 01 | fontkit/linebreak reachable only from never-eagerly-imported files | ✓ VERIFIED | Repo-wide grep of `components/**` for `fontkit\|linebreak` → 4 hits, ALL comments in `use-paginated-preview.ts`. The only import is `await import('@/lib/estimate/pagination/measure/browser-estimator')` at line 69, gated on `enabled === true`. `pagination-engine-boundary.test.ts` asserts the engine core has zero fontkit/linebreak imports AND (inverse) that `browser-estimator.ts` has zero `node:fs`/`node:path`/`server-only`. |
| 02 | Two icon buttons immediately left of "Edit with AI"; VersionSlot bridge (not zustand/URL) | ✓ VERIFIED | `project-header.tsx:54-55`. `estimate-editor.tsx:689-703` publishes `viewMode` + `onViewModeChange` into `setSlot({…})`. |
| 02 | Legacy floating-pill toggle gone; exactly one page-view control | ✓ VERIFIED | See SC-4 above. |
| 02 | Toggle state session-only — no localStorage persistence (DEFER-04) | ✓ VERIFIED | `useState<EstimateViewMode>('width')` at `estimate-editor.tsx:293`; zero `localStorage` in any workspace/estimate file. |
| 02 | `VersionSlot.viewMode`/`onViewModeChange` OPTIONAL | ✓ VERIFIED | `estimate-version-context.tsx:23-24` — both `?`-optional; `ViewModeToggle` returns `null` when `mode === undefined` (proven by `view-mode-toggle.test.tsx` case 1). |
| 03 | Paginated mode renders sheets whose block ASSIGNMENT matches the engine; positional correctness proven at pure-function + real-browser tiers, never asserted in jsdom | ✓ VERIFIED | `derive-page-offsets.test.ts` (7 cases incl. the cascade-correction simulation) + `pagination-binding-check.ts` (real Chromium, PASSED). `paginated-preview-canvas.test.tsx`'s header comment explicitly disclaims any positional assertion. |
| 03 | Editing/dnd unchanged; SAME editable tree reused, never a forked read-only copy | ✓ VERIFIED | `estimate-editor.tsx:763-793`; `paginated-editing-preserved.test.tsx` case 2 asserts rendered section/item DOM order equals `data.sections` order regardless of a deliberately mismatched stub page assignment. |
| 03 | Prepared-by + companyTerms render in the EDITOR (both modes) via optional props the share webview never receives | ✓ VERIFIED | `estimate-document.tsx:183-184` (optional props), `:1731`/`:1859` (render sites), `estimate-editor.tsx:790-791` and `:815-816` (both modes). `document-prepared-by-terms.test.tsx` proves content ORDER (Terms → Payment → Signature → Photos → Prepared-by) and the neither-prop share case. |
| 03 | Continuation pages repeat the items-table column header; "Page N of M" below every sheet | ⚠️ **PARTIAL** | "Page N of M" ✓ (`paginated-document-overlay.tsx:323-328`, proven by `paginated-preview-canvas.test.tsx`). Column header ✗ — the strip is a childless `<div>` with the header's classes but no labels. **See Gaps below.** |
| 03 | fontkit/linebreak never in the base editor bundle | ✓ VERIFIED | See plan-01 row 3. |
| 03 | pageWrapRef drops its single-sheet maxWidth; IssuedInvoicesPanel/GenerateInvoiceDialog render OUTSIDE the tray in both modes | ✓ VERIFIED | `estimate-editor.tsx:758-762` — `className={viewMode === 'page' ? 'w-full' : undefined}`, no maxWidth. `<IssuedInvoicesPanel>` at `:826` and `<GenerateInvoiceDialog>` at `:828-837` are siblings AFTER the `</div>` at `:819`. |
| 03 | Measurement shell never oscillates: reset → snapshot → pure arithmetic → one batched write, with an RO self-write guard | ✓ VERIFIED | `paginated-document-overlay.tsx:231-275` — Phase A resets every anchor's `marginTop`, forces exactly one reflow (`void container.offsetHeight`), snapshots `offsetTop`/`scrollHeight`; Phase B is pure `derivePageOffsets()` with zero interleaved reads; `isApplyingRef` (cleared on the next `requestAnimationFrame`) makes the ResizeObserver ignore self-triggered callbacks. `derivePageOffsets` read line-by-line: **zero DOM references**, two acyclic passes. |
| 04 | Structural actions repaginate on the very next render, bypassing any pending text debounce | ✓ VERIFIED | `use-estimate-reducer.ts:216-220` (`structuralDirty`), `:648-667` (photo actions bump epoch only). `use-paginated-preview.test.ts` case 4 lands a structural change mid-debounce, asserts 1 immediate call, then advances 400ms and asserts still 1 (stale timer cleared). |
| 04 | Typing repaginates only after a 400ms pause; rapid keystrokes collapse to one recomputation | ✓ VERIFIED | `use-paginated-preview.test.ts` cases 2-3 — fake timers, real `computePageBreaks` spied via partial mock, exact 399/400 boundary and 3-keystroke collapse. Non-vacuous. |
| 04 | A boundary-crossing edit never loses focus or remounts the row (stable-key regression test, not an assertion) | ✓ VERIFIED | `paginated-editing-preserved.test.tsx` case 1 — captures the live DOM node + input for `item-c2`, focuses it, dispatches `ADD_ITEM` on `section-a`, then asserts `toBe` node identity on BOTH and `document.activeElement === targetInput`. |
| 04 | dnd-kit dispatches the same REORDER actions in document order; page membership is never a third axis | ✓ VERIFIED | `paginated-editing-preserved.test.tsx` case 2 (deliberately mismatched `STUB_PAGES`). `EstimateDocument` never receives a `pages` prop at all. `REORDER_ITEMS`/`REORDER_SECTIONS` covered in `estimate-reducer-structural-epoch.test.ts`. |
| 04 | Share webview never imports pagination modules — enforced automatically, catching dynamic-import forms | ✓ VERIFIED | See SC-5. |
| 04 | The REAL hook + overlay pipeline produces exactly as many sheets as `computePageBreaks()` computes directly | ✓ VERIFIED | `paginated-view-engine-parity.test.tsx` — real browser fontkit build, real font fetch from `public/fonts/**`, real `usePaginatedPreview` + `PaginatedDocumentOverlay` + `EstimateDocument mode="edit"`, `enginePages.length > 1` guard, `waitFor` on `[data-page-sheet]` count, both templates. |

**Plan-level score: 19/20 verified, 1 partial.**

### Required Artifacts

| Artifact | Expected | Lines | Status |
|---|---|---|---|
| `lib/estimate/pagination/page-constraints.ts` | Single constraints source | 47 | ✓ VERIFIED (3 production/test consumers) |
| `lib/estimate/pagination/measure/line-packer.ts` | Isomorphic `packLines` | 63 | ✓ VERIFIED (imported by both estimator shells) |
| `lib/estimate/pagination/measure/browser-estimator.ts` | fetch + `fontkit.create`, client-safe | 111 | ✓ VERIFIED (boundary test asserts no node:fs/node:path/server-only) |
| `components/workspace/view-mode-toggle.tsx` | Segmented icon pill per UI-SPEC §1 | 46 | ✓ VERIFIED (matches spec verbatim; 6 green tests) |
| `components/workspace/estimate/use-paginated-preview.ts` | Unconditional hook, `enabled`-gated, lazy fontkit | 163 | ✓ VERIFIED |
| `components/workspace/estimate/paginated-document-overlay.tsx` | Pure `derivePageOffsets` + two-phase RO-guarded shell | 339 | ⚠️ VERIFIED (continuation-header strip incomplete — see Gaps) |
| `components/workspace/estimate/estimate-document.tsx` | Anchors + optional preparedBy/companyTerms | 1869 | ✓ VERIFIED (`data-page-block-id` on 11 block kinds, `data-item-id` on rows) |
| `scripts/pagination-binding-check.ts` | Real-Chromium positional binding | 287 | ✓ VERIFIED (PASSED; see Info note on the hand-transcription) |
| `tests/unit/pagination/measure/browser-estimator-parity.test.ts` | Deep-equal PageAssignment[] proof | 167 | ✓ VERIFIED (non-vacuous) |
| `tests/unit/estimate/paginated-view-engine-parity.test.tsx` | Engine↔view binding | 147 | ✓ VERIFIED |
| `tests/unit/estimate/share-webview-pagination-boundary.test.ts` | Static + dynamic grep guard | 88 | ✓ VERIFIED |
| `tests/unit/workspace/estimate-reducer-structural-epoch.test.ts` | Epoch classification proof | 331 | ✓ VERIFIED (12 structural + 2 photo + 4 negative cases) |
| `.planning/phases/185-.../185-HUMAN-UAT.md` | UAT checklist, `status: partial` | 64 | ✓ VERIFIED (frontmatter `status: partial`; browser-feel + owner-reference items present, all unchecked) |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `lib/pdf/render-estimate-pdf.ts` | `page-constraints.ts` | `computeEstimatePageConstraints(company, templateId)` @ :200 | ✓ WIRED |
| `tests/unit/pdf/_pages-for-fixture.ts` | `page-constraints.ts` | same call @ :54, inline copy removed | ✓ WIRED |
| `measure/estimator.ts` + `measure/browser-estimator.ts` | `measure/line-packer.ts` | both call the SAME `packLines()` | ✓ WIRED |
| `project-header.tsx` | `view-mode-toggle.tsx` | `<ViewModeToggle mode={slot?.viewMode} onModeChange={slot?.onViewModeChange} />` @ :54 | ✓ WIRED |
| `estimate-editor.tsx` | `estimate-version-context.tsx` | `setSlot({ …, viewMode, onViewModeChange })` @ :689-703 | ✓ WIRED |
| `use-paginated-preview.ts` | `browser-estimator.ts` | `await import(...)` @ :69, gated on `enabled` | ✓ WIRED (dynamic only) |
| `paginated-document-overlay.tsx` | `estimate-document.tsx` | `[data-page-block-id]` reset-then-snapshot @ :236-245 | ✓ WIRED |
| `estimate-editor.tsx` | `paginated-document-overlay.tsx` | rendered only when `viewMode === 'page'`; invoice surfaces are siblings | ✓ WIRED |
| `use-estimate-reducer.ts` | `use-paginated-preview.ts` | `structuralEpoch: state.structuralEditEpoch` @ :312 | ✓ WIRED |
| `paginated-document-overlay.tsx` | `derivePageOffsets` memoization | `offsetsOptions` useMemo + effect deps @ :223-226, :275 | ✓ WIRED (proven by the querySelector-spy test) |
| `.planning/REQUIREMENTS.md` | PGBRK-01/04 closure | checkboxes + coverage rows cite the parity tests | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|---|---|---|---|---|
| `PaginatedDocumentOverlay` | `pages` | `usePaginatedPreview().pages` ← real `computePageBreaks(blocksFromModel(...), constraints, browserProvider)` | Yes | ✓ FLOWING |
| `PaginatedDocumentOverlay` | `pageOffsets` | `derivePageOffsets()` fed by real `offsetTop`/`scrollHeight` reads | Yes (real Chromium proven) | ✓ FLOWING |
| `ViewModeToggle` | `mode` | `slot?.viewMode` ← `estimate-editor.tsx` `useState` published via `setSlot` | Yes | ✓ FLOWING |
| `EstimateDocument` | `preparedBy` / `companyTerms` | threaded `page.tsx → ProjectWorkspace → OverviewTab → EstimateTab → EstimateEditor` from real company columns | Yes | ✓ FLOWING |
| `EstimateDocument` | `documentData` | `useMemo(() => stateToDocumentData(state), [state])` ← real reducer | Yes | ✓ FLOWING |
| Continuation header strip | — | (no data bound; childless div) | No | ⚠️ HOLLOW — see Gaps |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| CI typecheck clean | `npx tsc -p tsconfig.ci.json --noEmit` | exit 0 | ✓ PASS |
| Full suite green | `npx vitest run tests/unit tests/eval` | 4891 passed / 21 todo, 0 failed | ✓ PASS |
| Phase tests green in isolation | 12 phase-185 files | 74 passed | ✓ PASS |
| Real-browser positional binding | `npx tsx scripts/pagination-binding-check.ts` | PASSED, exit 0 | ✓ PASS |
| fontkit browser build genuinely distinct | `require('fontkit/dist/browser.cjs')` | `create: function`, `openSync: undefined` | ✓ PASS (parity test is non-vacuous) |
| Legacy toggle keys gone | grep `VIEW_MODE_KEY` repo-wide | 0 hits | ✓ PASS |
| No static fontkit in components | grep `fontkit\|linebreak` in `components/**` | 4 hits, all comments | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| PGBRK-01 | 185-01, 185-04 | ✓ SATISFIED | `browser-estimator-parity.test.ts` (byte-identical `PageAssignment[]`, both templates, multi-page fixture, real browser fontkit build) + `paginated-view-engine-parity.test.tsx` (LIVE rendered sheet count == direct engine output). Single-source `computeEstimatePageConstraints` verified by grep. |
| PGBRK-04 | 185-01, 185-04 | ✓ SATISFIED | PDF still renders explicit `<Page>` per assignment (184, untouched); `paginated-view-engine-parity.test.tsx` proves the web preview shows the same page count for the same estimate+template. **Caveat:** "same content on the same pages" holds for block assignment; the continuation-page column-header CHROME differs (gap below). |
| PGMODE-01 | 185-02 | ✓ SATISFIED | `project-header.tsx:54`, `view-mode-toggle.test.tsx` (6 cases: null-when-undefined, aria-pressed both directions, both click callbacks, exact tooltip copy). |
| PGMODE-02 | 185-03 | ⚠️ SATISFIED WITH GAP | Letter-size sheets, centering, gaps, shadows, page numbers all present and tested; engine parity proven. Continuation-header labels missing. |
| PGMODE-03 | 185-03, 185-04 | ✓ SATISFIED | `estimate-reducer-structural-epoch.test.ts` + `use-paginated-preview.test.ts` + `paginated-editing-preserved.test.tsx`. Page membership is never persisted (no `pages` prop reaches `EstimateDocument`). |
| PGMODE-04 | 185-02 | ✓ SATISFIED (with the UI-SPEC §4 zoom-reuse deviation, flagged for human sign-off) | See SC-4. |
| PGMODE-05 | 185-04 | ✓ SATISFIED | `share-webview-pagination-boundary.test.ts` + `document-prepared-by-terms.test.tsx`'s neither-prop case. |

No ORPHANED requirements: `.planning/REQUIREMENTS.md` maps exactly PGMODE-01..05 to Phase 185 (plus PGBRK-01/04 shared with 184), and every one is claimed by a plan's `requirements` field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `components/workspace/estimate/paginated-document-overlay.tsx` | 315-321 | Childless `<div>` standing in for a content-bearing header | ⚠️ Warning | Continuation pages show a blank grey band instead of the PDF's real column labels. |
| `tests/unit/estimate/paginated-preview-canvas.test.tsx` | 59-73 | Test asserts element presence but never content | ⚠️ Warning | The empty strip passes; no regression pressure to fill it. |
| `scripts/pagination-binding-check.ts` | 101-148 | `derivePageOffsets` hand-transcribed instead of imported | ℹ️ Info | Verified line-by-line to be in exact lockstep TODAY; no automated guard against future drift. Fixture also uses stand-in reservation constants (120/60/30) rather than the real `measureHeaderHeightPt`-derived values. |
| `components/workspace/estimate/paginated-document-overlay.tsx` | 297 | `sheetTopPx = contentTopPx - topReservationPx` | ℹ️ Info | On a `continuesTable` page the sheet starts `continuationHeaderPx` below `cumulative`, so that inter-sheet gap is `pageGapPx + continuationHeaderPx`. Binding check still passed with continuation pages present (pages 1-3). |
| `components/workspace/estimate/estimate-floating-actions.tsx` | 11 | `EstimateViewMode` type still exported from the file whose toggle was retired | ℹ️ Info | Cosmetic organisation only — `view-mode-toggle.tsx` and `estimate-version-context.tsx` both import it from here. |
| `components/workspace/estimate/estimate-editor.tsx` | 331-355, 761 | Surviving `pageZoom` / CSS `zoom` | ℹ️ Info | Deliberate reuse per 185-UI-SPEC.md §4; contradicts SC-4's literal wording. Human sign-off requested. |

Zero `TODO`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER`/"not yet implemented" markers in any of the phase's new files.

### Human Verification Required

`185-HUMAN-UAT.md` exists with `status: partial` and 3 unchecked items (browser-feel, real positional binding at scale, owner reference image) — all correctly scoped to things jsdom structurally cannot prove. This verification adds a 4th: the CSS-zoom reuse decision (see frontmatter `human_verification`).

### Gaps Summary

**One gap, partial, non-blocking for the phase goal.**

The phase's headline promise is a paginated editor mode that *mirrors the PDF*. Block assignment mirrors it exactly — proven three ways (browser↔server measurement parity, engine↔rendered-view parity, real-Chromium positional binding). But the continuation-page CHROME does not: the PDF renders a genuine repeated items-table column header (`PdfTableHeaderOnly({ L, ... })` at `estimate-pdf.tsx:660` / `estimate-pdf-modern.tsx:676`, emitting `L.description` / `L.qty` / `L.unitPrice` / `L.total`), while the editor overlay renders a styled but **empty** strip of the right height. Plan 185-03's own must-have truth says "Continuation pages repeat the items-table column header" — the height reservation is repeated, the header is not.

This is contained: one JSX element and one test assertion. It does not affect PDF output, page-break positions, editing, dnd, the share webview, or any requirement's other evidence. Everything else in this phase verified cleanly, with unusually strong test discipline — the parity tests are genuinely non-vacuous (confirmed by checking that fontkit's browser build really lacks `openSync`), the debounce tests use real spies at exact 399/400ms boundaries, and the focus test compares live DOM node identity rather than asserting by architecture.

Secondary, for the orchestrator's judgement rather than repair: ROADMAP success criterion 4 literally says the CSS-zoom mechanism must no longer appear in the editor, but 185-UI-SPEC.md §4 (a phase-approved artifact predating the plans) explicitly reuses its fit-to-viewport math. The criterion's intent — exactly one page-view control, in the header — is fully met.

---

_Verified: 2026-07-28T16:51:45Z_
_Verifier: Claude (gsd-verifier)_
