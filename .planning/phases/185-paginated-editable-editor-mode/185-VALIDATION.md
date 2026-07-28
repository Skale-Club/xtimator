---
phase: 185
slug: paginated-editable-editor-mode
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-28
---

# Phase 185 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit, jsdom for components), tsc |
| **Quick run command** | `npx vitest run tests/unit/pagination tests/unit/workspace tests/unit/estimate` |
| **Full suite command** | `npx vitest run tests/unit tests/eval && npx tsc -p tsconfig.ci.json --noEmit` |
| **Estimated runtime** | ~60-190s |

## Sampling Rate

- After every task commit: scoped quick command
- After every wave: full suite (orchestrator, authoritative)
- Max feedback latency: 190s

## Requirement → Proof Map (revised against plan-checker findings — 4 plans, 3 waves, 10 tasks)

| Requirement | Proof | Plan / Task |
|-------------|-------|-------------|
| PGBRK-01 / PGBRK-04 (mirror foundation) | Deep-equal `PageAssignment[]` between the server (fs+fontkit.openSync) and browser (fetch+fontkit's explicit `dist/browser.cjs` build) measurement providers, same fixture, same `computeEstimatePageConstraints()` | 185-01 Task 3 (`tests/unit/pagination/measure/browser-estimator-parity.test.ts`) |
| PGBRK-01 / PGBRK-04 (constraints parity, both call sites) | `computeEstimatePageConstraints()` matches the original inline derivation exactly, both templates; BOTH `render-estimate-pdf.ts` and its own test fixture helper (`_pages-for-fixture.ts`) call the shared function, never a 2nd/3rd copy | 185-01 Task 1 (`tests/unit/pagination/page-constraints.test.ts`) |
| PGBRK-01 / PGBRK-04 (client-safety boundary) | `browser-estimator.ts`/`line-packer.ts` excluded from the react-pdf/react/components-free core; `browser-estimator.ts` proven to have zero node:fs/node:path/server-only imports | 185-01 Task 2 (`tests/unit/pagination/pagination-engine-boundary.test.ts`) |
| PGBRK-01 / PGBRK-04 (engine parity BOUND to view parity — closure evidence) | The REAL (non-mocked) `usePaginatedPreview` + `PaginatedDocumentOverlay` pipeline, rendered against a fixture, produces exactly as many decorative page sheets as `computePageBreaks()` computes directly for the SAME fixture | 185-04 Task 2 (`tests/unit/estimate/paginated-view-engine-parity.test.tsx`) |
| PGMODE-01 | Two icon buttons render left of "Edit with AI"; `aria-pressed`/`aria-label`/tooltip copy per UI-SPEC; click calls `onModeChange`; VersionSlot fields optional, shared `EstimateViewMode` type | 185-02 Task 1 (`tests/unit/components/view-mode-toggle.test.tsx`) |
| PGMODE-04 | Legacy `viewMode`/"Full page"/"Full width" buttons + localStorage persistence (code AND stale comments) fully removed from estimate-floating-actions.tsx/estimate-editor.tsx | 185-02 Task 2 (`tests/unit/components/estimate-floating-actions.test.tsx`, updated) |
| PGMODE-02 | Paginated canvas renders N page sheets (letter-size, or taller only on genuine DOM overflow) matching the engine's `PageAssignment[].length`; positions derived from REAL measured DOM offsets (`derivePageOffsets()`, binding assertion within 1px); Page N of M chrome under every sheet incl. last; continuation table header only where `continuesTable` | 185-03 Task 3 (`tests/unit/estimate/paginated-preview-canvas.test.tsx`) |
| PGMODE-02/03 (prepared-by + company terms parity) | `preparedBy`/`companyTerms` render in the editor (both view modes) matching PDF content/order; absent when the caller omits them (share-webview byte-compatibility) | 185-03 Task 3 (`tests/unit/estimate/document-prepared-by-terms.test.tsx`) |
| PGMODE-03 (editing continues to work) | Same editable `EstimateDocument` tree reused unforked; anchored via `data-page-block-id`/`data-item-id`, sliced via a measurement-driven decoration overlay only, never re-parented | 185-03 Task 3 (component structure, verified via paginated-preview-canvas.test.tsx + manual checkpoint) |
| PGMODE-03 (structural vs. text repagination triggers) | `structuralEditEpoch` (reducer-level, exhaustively classified) bumps on structural actions only; hook recomputes IMMEDIATELY on a structural-epoch change, DEBOUNCED 400ms on a text-only data-reference change, collapsing rapid keystrokes into one recompute | 185-04 Task 1 (`tests/unit/workspace/estimate-reducer-structural-epoch.test.ts` + `tests/unit/estimate/use-paginated-preview.test.ts`) |
| PGMODE-03 (focus + dnd-kit preserved) | Focus/key-stability survives a cross-page structural edit (stable `data-item-id`, no remount); dnd-kit's document order stays unaffected by page membership | 185-04 Task 2 (`tests/unit/estimate/paginated-editing-preserved.test.tsx`) |
| PGMODE-05 | `app/estimate/[token]/**` and `components/share/**` never import `lib/estimate/pagination/*` or the new paginated-editor modules — STATIC `from` imports AND dynamic `import(...)` forms both grepped | 185-04 Task 2 (`tests/unit/estimate/share-webview-pagination-boundary.test.ts`) |

## Wave 0 Requirements

- [x] Shared `computeEstimatePageConstraints()` extraction (single constraints source for PDF production path + its own test fixture helper + the future web path) — 185-01 Task 1
- [x] Browser-shell estimator (fetch→ArrayBuffer→fontkit's explicit browser build) with a deep-equal parity test proving measurement parity with the server estimator (same font bytes → identical PageAssignment[]) — 185-01 Task 2 + Task 3

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Real-browser paginated editing feel (no reflow thrash/flicker, drag across pages, zoom) | PGMODE-02/03 | jsdom can't judge visuals/timing or real layout | Open a large estimate, toggle paginated, type in a long description, drag items/sections, verify smoothness + focus + that decorative sheets visually track the real content |
| Visual match to the pending owner reference image | PGMODE-02 | Reference not yet supplied | Compare when it arrives; adjust [ADJUSTABLE] tokens from UI-SPEC |

## Validation Sign-Off

- [x] All tasks must carry `<automated>` verify (planner contract) — confirmed present on all 10 tasks across 185-01..04
- [x] Wave 0 = constraints extraction + browser-estimator parity (the mirror-critical items first) — 185-01, Wave 1
- [x] No watch-mode flags; feedback latency < 190s
- [x] `nyquist_compliant: true`

**Approval:** approved (orchestrator, from 185-RESEARCH.md Validation Architecture); revised post plan-checker (Opus) pass — see each plan's `<revision_note>`.

**Plans created:** 185-01 (Mirror Foundation, wave 1, 3 tasks), 185-02 (Toggle, wave 1, 2 tasks), 185-03 (Paginated View — real DOM measurement + prepared-by/company-terms, wave 2, 3 tasks), 185-04 (Editing Integration — reducer structural epoch + engine-parity closure, wave 3, 2 tasks).
