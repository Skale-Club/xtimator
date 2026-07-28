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

## Requirement → Proof Map (finalized against the 4 created plans)

| Requirement | Proof | Plan / Task |
|-------------|-------|-------------|
| PGBRK-01 / PGBRK-04 (mirror foundation) | Deep-equal `PageAssignment[]` between the server (fs+fontkit.openSync) and browser (fetch+fontkit.create) measurement providers, same fixture, same `computeEstimatePageConstraints()` | 185-01 Task 3 (`tests/unit/pagination/measure/browser-estimator-parity.test.ts`) |
| PGBRK-01 / PGBRK-04 (constraints parity) | `computeEstimatePageConstraints()` matches `render-estimate-pdf.ts`'s original inline derivation exactly, both templates | 185-01 Task 1 (`tests/unit/pagination/page-constraints.test.ts`) |
| PGBRK-01 / PGBRK-04 (client-safety boundary) | `browser-estimator.ts`/`line-packer.ts` excluded from the react-pdf/react/components-free core; `browser-estimator.ts` proven to have zero node:fs/node:path/server-only imports | 185-01 Task 2 (`tests/unit/pagination/pagination-engine-boundary.test.ts`) |
| PGMODE-01 | Two icon buttons render left of "Edit with AI"; `aria-pressed`/`aria-label`/tooltip copy per UI-SPEC; click calls `onModeChange` | 185-02 Task 1 (`tests/unit/components/view-mode-toggle.test.tsx`) |
| PGMODE-04 | Legacy `viewMode`/"Full page"/"Full width" buttons + localStorage persistence fully removed from estimate-floating-actions.tsx/estimate-editor.tsx | 185-02 Task 2 (`tests/unit/components/estimate-floating-actions.test.tsx`, updated) |
| PGMODE-02 | Paginated canvas renders N page boxes matching the engine's `PageAssignment[].length`; letter geometry from tokens; Page N of M chrome; continuation table header only where `continuesTable` | 185-03 Task 2 (`tests/unit/estimate/paginated-preview-canvas.test.tsx`) |
| PGMODE-03 (editing continues to work) | Same editable `EstimateDocument` tree reused unforked, sliced via decoration overlay only | 185-03 Task 2 (component structure, verified via paginated-preview-canvas.test.tsx + manual checkpoint) |
| PGMODE-03 (repagination triggers + focus) | Structural change -> immediate recompute; text change -> 400ms debounce, collapsed; focus/key-stability survives a cross-page structural edit; dnd-kit stays document-order-only | 185-04 Task 1 (`tests/unit/estimate/use-paginated-preview.test.ts`) + Task 2 (`tests/unit/estimate/paginated-editing-preserved.test.tsx`) |
| PGMODE-05 | `app/estimate/[token]/**` and `components/share/**` never import `lib/estimate/pagination/*` or the new paginated-editor modules | 185-04 Task 2 (`tests/unit/estimate/share-webview-pagination-boundary.test.ts`) |

## Wave 0 Requirements

- [x] Shared `computeEstimatePageConstraints()` extraction (single constraints source for PDF + web paths) — 185-01 Task 1
- [x] Browser-shell estimator (fetch→ArrayBuffer→fontkit.create) with a deep-equal parity test proving measurement parity with the server estimator (same font bytes → identical PageAssignment[]) — 185-01 Task 2 + Task 3

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Real-browser paginated editing feel (no reflow thrash/flicker, drag across pages, zoom) | PGMODE-02/03 | jsdom can't judge visuals/timing | Open a large estimate, toggle paginated, type in a long description, drag items/sections, verify smoothness + focus |
| Visual match to the pending owner reference image | PGMODE-02 | Reference not yet supplied | Compare when it arrives; adjust [ADJUSTABLE] tokens from UI-SPEC |

## Validation Sign-Off

- [x] All tasks must carry `<automated>` verify (planner contract) — confirmed present on all 9 tasks across 185-01..04
- [x] Wave 0 = constraints extraction + browser-estimator parity (the mirror-critical items first) — 185-01, Wave 1
- [x] No watch-mode flags; feedback latency < 190s
- [x] `nyquist_compliant: true`

**Approval:** approved (orchestrator, from 185-RESEARCH.md Validation Architecture)

**Plans created:** 185-01 (Mirror Foundation, wave 1), 185-02 (Toggle, wave 1), 185-03 (Paginated View, wave 2), 185-04 (Editing Integration, wave 3).
