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

## Requirement → Proof Map

| Requirement | Proof |
|-------------|-------|
| PGMODE-01 | Component test: two icon buttons render left of "Edit with AI" in the header; clicking toggles VersionSlot viewMode; aria-pressed/labels per UI-SPEC |
| PGMODE-02 | Component test: paginated mode renders N page boxes with letter geometry (px from ESTIMATE_PAGE_GEOMETRY), page chrome "Page N of M"; page count equals the engine's PageAssignment[].length for the same fixture |
| PGMODE-03 | Component tests: inline edit inside a page box updates state; structural change (add item) triggers immediate repagination; typing repagination debounced (~400ms, fake timers); focus preserved across a repagination that moves the focused item to another page (stable keys) |
| PGMODE-04 | Static + component: legacy viewMode/'Full page' buttons removed from estimate-floating-actions.tsx; no colliding "page" concept; updated tests green |
| PGMODE-05 | Boundary test: components/share/** imports nothing from the new paginated modules; share tests untouched and green |
| PGBRK-01/04 closure | PARITY test (the phase's most important): same fixture document model → client-side estimator pipeline produces PageAssignment[] DEEP-EQUAL to the server/PDF path's (same blocksFromModel + computePageBreaks + SAME PageConstraints incl. PDF_RENDER_SAFETY_MARGIN_PT via shared computeEstimatePageConstraints()) |

## Wave 0 Requirements

- [ ] Shared `computeEstimatePageConstraints()` extraction (single constraints source for PDF + web paths)
- [ ] Browser-shell estimator (fetch→ArrayBuffer→fontkit.create) with a Node-side unit test proving measurement parity with the server estimator (same font bytes → identical line counts)

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Real-browser paginated editing feel (no reflow thrash/flicker, drag across pages, zoom) | PGMODE-02/03 | jsdom can't judge visuals/timing | Open a large estimate, toggle paginated, type in a long description, drag items/sections, verify smoothness + focus |
| Visual match to the pending owner reference image | PGMODE-02 | Reference not yet supplied | Compare when it arrives; adjust [ADJUSTABLE] tokens from UI-SPEC |

## Validation Sign-Off

- [x] All tasks must carry `<automated>` verify (planner contract)
- [x] Wave 0 = constraints extraction + browser-estimator parity (the mirror-critical items first)
- [x] No watch-mode flags; feedback latency < 190s
- [x] `nyquist_compliant: true`

**Approval:** approved (orchestrator, from 185-RESEARCH.md Validation Architecture)
