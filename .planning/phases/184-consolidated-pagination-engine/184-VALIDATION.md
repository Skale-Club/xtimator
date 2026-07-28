---
phase: 184
slug: consolidated-pagination-engine
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-28
---

# Phase 184 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit), tsc, standalone tsx script for the spike |
| **Quick run command** | `npx vitest run tests/unit/pagination tests/unit/pdf` |
| **Full suite command** | `npx vitest run tests/unit tests/eval && npx tsc -p tsconfig.ci.json --noEmit` |
| **Estimated runtime** | ~60-180s (spike script separate, ~1-2 min once) |

## Sampling Rate

- After every task commit: scoped quick command
- After every wave: full suite (orchestrator, authoritative)
- Max feedback latency: 180s

## Requirement → Proof Map

| Requirement | Proof | Plan(s) / Task(s) |
|-------------|-------|--------------------|
| PGBRK-01 | Engine unit tests: fixture blocks → deterministic page-map snapshots; byte-stable across two runs in one test; blocksFromModel structural fixtures; real-pipeline determinism test on a multi-page fixture | 184-02 Task 2 (`tests/unit/pagination/engine.test.ts`); 184-03 Task 2 (`tests/unit/pagination/blocks-from-model.test.ts`); 184-05 Task 3 (`tests/unit/pdf/estimate-pdf-pagination.test.tsx` determinism case) |
| PGBRK-02 | Rule unit tests per invariant: row never split; section header keeps ≥1 row; subtotal keeps with last row; totals/signature/terms-card atomic; photo grid breaks only between rows; component-level atomicity restructuring + regression tests | 184-02 Task 2 (`tests/unit/pagination/rules.test.ts`, `engine.test.ts`); 184-04 Tasks 1-3 (`pdf-section-block.tsx`/`pdf-photo-grid.tsx`/`pdf-terms-section.tsx` restructure + `estimate-pdf-photo-grid-atomicity.test.tsx` + `estimate-pdf-terms-atomicity.test.tsx`) |
| PGBRK-03 | PDF structural tests: continuation page repeats items-table column header; every page footer shows computed "Page N of M" | 184-04 Task 1 (`PdfTableHeaderOnly` extraction); 184-05 Task 2 (continuation dispatch) + Task 3 (`estimate-pdf-pagination.test.tsx` repeated-header assertion) |
| PGBRK-04 | Template tests: N explicit `<Page>` elements matching the engine's page count for multi-page fixtures; single-page fixture → 1 Page; baseline-order tests updated intentionally; real `renderToBuffer` smoke | 184-05 Task 1 (resolver wiring) + Task 2 (N-`<Page>` composition) + Task 3 (`estimate-pdf-pagination.test.tsx`, updated `estimate-pdf-baseline-order.test.tsx`) + Task 4 (manual visual checkpoint) |
| PGBRK-05 | Spike script `scripts/pagination-drift-spike.ts` (fontkit vs real-Chromium getClientRects) — output doc + derived `SAFETY_MARGIN_LINES` constant committed; hand-calculated arithmetic unit test; estimator unit test matching the same hand-calculated expected line counts | 184-01 Task 1 (`tests/unit/pagination/measure/fontkit-arithmetic.test.ts`) + Task 2 (`scripts/pagination-drift-spike.ts`, `184-DRIFT-REPORT.md`, `measure/safety-margin.ts`); 184-03 Task 1 (`tests/unit/pagination/measure/estimator.test.ts`) |

## Wave 0 Requirements

- [x] Spike script + drift report + SAFETY_MARGIN_LINES constant (blocks estimator finalization) — Plan 184-01 Task 2
- [x] Hand-calculated fontkit arithmetic unit test (validates the layout()/advanceWidth scale math before the estimator builds on it) — Plan 184-01 Task 1

## Plan / Wave Map

| Wave | Plan | Objective | Depends on |
|------|------|-----------|------------|
| 1 | 184-01 | Measurement-drift spike + SAFETY_MARGIN_LINES + hand-calculated fontkit arithmetic proof | — |
| 1 | 184-02 | Pure pagination type contracts + `computePageBreaks()` engine + rules, tested against a fake provider | — |
| 2 | 184-03 | Server-only fontkit/linebreak estimator + `blocksFromModel()` (empty-description filter) | 184-01, 184-02 |
| 2 | 184-04 | Component restructure: split `PdfSectionBlock`; row-chunk `PdfPhotoGrid`; per-card-atomic `PdfTermsSection` (single-page output unchanged) | 184-02 |
| 3 | 184-05 | Wire both PDF templates to N explicit `<Page>`s from the engine's output; repeated continuation headers; determinism + renderToBuffer smoke; manual visual checkpoint | 184-03, 184-04 |

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Multi-page PDF looks right (headers repeat, no orphan/widow visual oddities) | PGBRK-02/03/04 | Structural tests can't judge visuals | Plan 184-05 Task 4 (checkpoint:human-verify): download PDFs for a 1-page and a 4+-page estimate, both templates; check breaks/repeated headers/footers |

## Validation Sign-Off

- [x] All tasks must carry `<automated>` verify (planner contract)
- [x] Wave 0 = spike + arithmetic validation (the LOW-confidence items go first)
- [x] No watch-mode flags; feedback latency < 180s
- [x] `nyquist_compliant: true`

**Approval:** approved (orchestrator, from 184-RESEARCH.md Validation Architecture)
