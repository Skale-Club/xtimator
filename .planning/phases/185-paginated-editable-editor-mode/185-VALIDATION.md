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
| **Framework** | vitest (unit, jsdom for components), tsc; a standalone Playwright script (non-blocking) for the one claim jsdom cannot prove |
| **Quick run command** | `npx vitest run tests/unit/pagination tests/unit/workspace tests/unit/estimate` |
| **Full suite command** | `npx vitest run tests/unit tests/eval && npx tsc -p tsconfig.ci.json --noEmit` |
| **Estimated runtime** | ~60-190s |

## Sampling Rate

- After every task commit: scoped quick command
- After every wave: full suite (orchestrator, authoritative)
- Max feedback latency: 190s

## Requirement → Proof Map (revised against the 3rd plan-checker pass — 4 plans, 3 waves, 11 tasks)

| Requirement | Proof | Plan / Task |
|-------------|-------|-------------|
| PGBRK-01 / PGBRK-04 (mirror foundation) | Deep-equal `PageAssignment[]` between the server (fs+fontkit.openSync) and browser (fetch+fontkit.create) measurement providers, same fixture, same `computeEstimatePageConstraints()` — the browser provider's real `dist/browser.cjs` build is forced under Node/Vitest via a test-scoped `vi.mock('fontkit', ...)` (fontkit's bare specifier already resolves there automatically outside Node; only this plan's own Node-based test needs the extra push) | 185-01 Task 3 (`tests/unit/pagination/measure/browser-estimator-parity.test.ts`) |
| PGBRK-01 / PGBRK-04 (constraints parity, both call sites) | `computeEstimatePageConstraints()` matches the original inline derivation exactly, both templates; BOTH `render-estimate-pdf.ts` and its own test fixture helper (`_pages-for-fixture.ts`) call the shared function, never a 2nd/3rd copy | 185-01 Task 1 (`tests/unit/pagination/page-constraints.test.ts`) |
| PGBRK-01 / PGBRK-04 (client-safety boundary) | `browser-estimator.ts`/`line-packer.ts` excluded from the react-pdf/react/components-free core; `browser-estimator.ts` proven to have zero node:fs/node:path/server-only imports | 185-01 Task 2 (`tests/unit/pagination/pagination-engine-boundary.test.ts`) |
| PGBRK-01 / PGBRK-04 (engine parity BOUND to view parity — closure evidence) | The REAL (non-mocked) `usePaginatedPreview` + `PaginatedDocumentOverlay` pipeline, rendered against a fixture, produces exactly as many decorative page sheets as `computePageBreaks()` computes directly for the SAME fixture | 185-04 Task 2 (`tests/unit/estimate/paginated-view-engine-parity.test.tsx`) |
| PGMODE-01 | Two icon buttons render left of "Edit with AI"; `aria-pressed`/`aria-label`/tooltip copy per UI-SPEC; click calls `onModeChange`; VersionSlot fields optional, shared `EstimateViewMode` type | 185-02 Task 1 (`tests/unit/components/view-mode-toggle.test.tsx`) |
| PGMODE-04 | Legacy `viewMode`/"Full page"/"Full width" buttons + localStorage persistence (code AND stale comments) fully removed from estimate-floating-actions.tsx/estimate-editor.tsx | 185-02 Task 2 (`tests/unit/components/estimate-floating-actions.test.tsx`, updated) |
| **PGMODE-02 (sheet count, chrome, fail-soft — jsdom tier)** | Paginated canvas renders EXACTLY `pages.length` decorative sheets, driven by `pages.map(...)` alone, never filtered by measurement outcome; Page N of M chrome under every sheet incl. last; continuation table header only where `continuesTable`; no `overflow: hidden`; `pages={null}` fail-soft | 185-03 Task 3b (`tests/unit/estimate/paginated-preview-canvas.test.tsx`) |
| **PGMODE-02 (page-top/sheet-height arithmetic — pure-function tier)** | `derivePageOffsets()` is a genuinely PURE, two-pass, non-oscillating function — page tops, sheet heights (incl. the overflow-rule branch), gap accumulation, and continuation reservation all proven with plain number-array fixtures, zero DOM mocking | 185-03 Task 3b (`tests/unit/estimate/derive-page-offsets.test.ts`) |
| **PGMODE-02 (real positional binding — Playwright/browser tier, NOT jsdom)** | jsdom performs no real layout and cannot prove "content renders inside its matching sheet" — that claim is proven in a REAL Chromium instance instead: a standalone script lays out a real ≥3-page fixture, runs the actual algorithm, and asserts each page's first block's `getBoundingClientRect()` falls inside its sheet's rect with no block straddling a boundary. Not part of the blocking CI gate (matches this project's established Playwright-optional-to-ship stance); run manually/on-demand, supplemented by the Manual-Only visual UAT below | 185-03 Task 3b (`scripts/pagination-binding-check.ts`, `npx tsx scripts/pagination-binding-check.ts`) |
| PGMODE-02/03 (prepared-by + company terms parity) | `preparedBy`/`companyTerms` render in the editor (both view modes) matching PDF content/order; a dedicated `mode="view"`-with-neither-prop case proves the share webview's call pattern renders the 4 existing terms fields byte-identically to before this plan | 185-03 Task 3a (`tests/unit/estimate/document-prepared-by-terms.test.tsx`) |
| PGMODE-03 (editing continues to work) | Same editable `EstimateDocument` tree reused unforked; anchored via `data-page-block-id`/`data-item-id`, sliced via a measurement-driven decoration overlay only, never re-parented | 185-03 Task 3a/3b (component structure, verified via the above tests + manual checkpoint) |
| PGMODE-03 (structural vs. text repagination triggers) | `structuralEditEpoch` (reducer-level, exhaustively classified) bumps on structural actions only; hook recomputes IMMEDIATELY on a structural-epoch change, DEBOUNCED 400ms on a text-only data-reference change, collapsing rapid keystrokes into one recompute | 185-04 Task 1 (`tests/unit/workspace/estimate-reducer-structural-epoch.test.ts` + `tests/unit/estimate/use-paginated-preview.test.ts`) |
| PGMODE-03 (focus + dnd-kit preserved) | Focus/key-stability survives a cross-page structural edit (stable `data-item-id`, no remount); dnd-kit's document order stays unaffected by page membership | 185-04 Task 2 (`tests/unit/estimate/paginated-editing-preserved.test.tsx`) |
| PGMODE-05 | `app/estimate/[token]/**` and `components/share/**` never import `lib/estimate/pagination/*` or the new paginated-editor modules — STATIC `from` imports AND dynamic `import(...)` forms both grepped; reinforced by Task 3a's prop-optionality proof above | 185-04 Task 2 (`tests/unit/estimate/share-webview-pagination-boundary.test.ts`) |

## Wave 0 Requirements

- [x] Shared `computeEstimatePageConstraints()` extraction (single constraints source for PDF production path + its own test fixture helper + the future web path) — 185-01 Task 1
- [x] Browser-shell estimator (fetch→ArrayBuffer→fontkit.create, using the bare `'fontkit'` specifier) with a deep-equal parity test — forcing the real browser build under Node/Vitest via a test-scoped mock — proving measurement parity with the server estimator — 185-01 Task 2 + Task 3

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Real-browser paginated editing feel (no reflow thrash/flicker, drag across pages, zoom) | PGMODE-02/03 | jsdom can't judge visuals/timing or real layout | Open a large estimate, toggle paginated, type in a long description, drag items/sections, verify smoothness + focus + that decorative sheets visually track the real content |
| Real positional binding at scale (supplements the Playwright script's hardcoded fixture) | PGMODE-02 | Confirms the algorithm holds on genuine, varied estimate content, not just a synthetic fixture | Open a real ≥3-page estimate, toggle paginated, visually confirm each page's content sits inside its sheet with no item straddling a boundary |
| Visual match to the pending owner reference image | PGMODE-02 | Reference not yet supplied | Compare when it arrives; adjust [ADJUSTABLE] tokens from UI-SPEC |

## Validation Sign-Off

- [x] All tasks must carry `<automated>` verify (planner contract) — confirmed present on all 11 tasks across 185-01..04
- [x] Wave 0 = constraints extraction + browser-estimator parity (the mirror-critical items first) — 185-01, Wave 1
- [x] No watch-mode flags; feedback latency < 190s
- [x] `nyquist_compliant: true`
- [x] Positional/binding claims are tiered correctly: pure-function unit tests (page-top/sheet-height arithmetic) + jsdom (count/chrome/fail-soft, no positional claim) + a standalone Playwright script (the one REAL positional-binding proof) + manual UAT — never a jsdom test asserting something jsdom cannot measure

**Approval:** approved (orchestrator, from 185-RESEARCH.md Validation Architecture); revised post 3rd plan-checker (Opus) pass — see 185-01/185-03's `<revision_note>` for the exact fixes (fontkit resolution, the measurement-mechanism rewrite, and the proof-tier split).

**Plans created:** 185-01 (Mirror Foundation, wave 1, 3 tasks), 185-02 (Toggle, wave 1, 2 tasks), 185-03 (Paginated View — real DOM measurement + prepared-by/company-terms, wave 2, 4 tasks: 1, 2, 3a, 3b), 185-04 (Editing Integration — reducer structural epoch + engine-parity closure, wave 3, 2 tasks).
