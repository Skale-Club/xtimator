---
phase: 184
slug: consolidated-pagination-engine
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-28
revised: 2026-07-28 (plan-checker final pass — 4 blockers + 8 warnings applied; 26/27 prior items confirmed fixed)
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
| PGBRK-01 | Engine unit tests (fixture blocks → deterministic page-map snapshots, byte-stable, MAXIMAL keep-together chains incl. 1-item-section, persistent continuation-header reservation); blocksFromModel structural fixtures (ref population, visibility gates, pinned terms order); real-pipeline determinism test on a multi-page fixture | 184-02 Task 2 (`tests/unit/pagination/engine.test.ts`); 184-03 Task 2 (`tests/unit/pagination/blocks-from-model.test.ts`); 184-05 Task 3 (`tests/unit/pdf/estimate-pdf-pagination.test.tsx` determinism case) |
| PGBRK-02 | Rule unit tests per invariant: row never split; section header keeps ≥1 row (maximal chain); subtotal keeps with last row; totals/signature/terms-card atomic (incl. totals container wrap={false} fix); photo grid breaks only between rows; component-level atomicity restructuring + regression tests | 184-02 Task 2 (`tests/unit/pagination/rules.test.ts`, `engine.test.ts`); 184-04 Tasks 1-3 (`pdf-section-block.tsx`/`pdf-photo-grid.tsx`/`pdf-terms-section.tsx`/`pdf-totals-block.tsx` restructure + `estimate-pdf-photo-grid-atomicity.test.tsx` + `estimate-pdf-terms-atomicity.test.tsx`) |
| PGBRK-03 | PDF structural tests: continuation page repeats items-table column header exactly once (both triggers: after section-header, and at page-top iff continuesTable — mutually exclusive by construction); every page footer shows computed "Page N of M" | 184-04 Task 1 (`PdfTableHeaderOnly` extraction); 184-05 Task 2 (dual-trigger dispatch) + Task 3 (`estimate-pdf-pagination.test.tsx` repeated-header assertion) |
| PGBRK-04 | Template tests: N explicit `<Page>` elements matching the engine's page count for multi-page fixtures (verified against REAL PDF bytes via a `/Type /Page` regex, not just non-throwing); single-page fixture → 1 Page; ALL direct-call test files (baseline-order + 8 others) updated in the SAME task as the composition rewrite (no red window — `npx vitest run tests/unit/pdf` green at that commit); real `renderToBuffer` smoke; correctly-mapped terms cards (explicit map, not a broken `L[key]` lookup) | 184-05 Task 1 (resolver wiring + optional `pages` prop + resolver-test fix) + Task 2 (N-`<Page>` composition + ALL 9 direct-call test files, keyed dispatcher, explicit terms map) + Task 3 (`estimate-pdf-pagination.test.tsx` real-PDF-byte page count + determinism) + Task 4 (durable UAT artifacts + manual visual checkpoint) |
| PGBRK-05 | Spike script `scripts/pagination-drift-spike.ts` (fontkit vs real-Chromium getClientRects) — output doc + STATED per-page (not per-block) margin-application semantics + derived `SAFETY_MARGIN_LINES` constant committed; hand-calculated arithmetic unit test; estimator unit test matching the same hand-calculated expected line counts; LINE_HEIGHT tokens derived from real font metrics (ascent/descent/lineGap/unitsPerEm) | 184-01 Task 1 (`tests/unit/pagination/measure/fontkit-arithmetic.test.ts`) + Task 2 (`scripts/pagination-drift-spike.ts`, `184-DRIFT-REPORT.md`, `measure/safety-margin.ts`) + Task 3 (`tests/unit/estimate/pagination-tokens.test.ts`); 184-03 Task 1 (`tests/unit/pagination/measure/estimator.test.ts`) |

## Wave 0 Requirements

- [x] Spike script + drift report + SAFETY_MARGIN_LINES constant with stated per-page application semantics (blocks estimator finalization) — Plan 184-01 Task 2
- [x] Hand-calculated fontkit arithmetic unit test (validates the layout()/advanceWidth scale math before the estimator builds on it) — Plan 184-01 Task 1
- [x] LINE_HEIGHT + ESTIMATE_PAGE_GEOMETRY + photosPerRow tokens + visibleSectionItems derived from real font metrics / live StyleSheets / live filter logic — Plan 184-01 Task 3

## Plan / Wave Map

**Final revision per plan-checker re-verification (26/27 prior items confirmed fixed; this pass applies the last blocker + relevant warnings) — wave structure unchanged from the prior revision: 184-02 and 184-04 in Wave 2 (both depend on 184-01), 184-03 in Wave 3 (now depends on 184-01/184-02 ONLY — dropped 184-04 since `photosPerRow` moved to `lib/estimate/document/tokens.ts`), 184-05 in Wave 4 (depends on all).**

| Wave | Plan | Objective | Depends on |
|------|------|-----------|------------|
| 1 | 184-01 | Measurement-drift spike + SAFETY_MARGIN_LINES (stated per-page semantics) + hand-calculated fontkit arithmetic proof + LINE_HEIGHT/ESTIMATE_PAGE_GEOMETRY/photosPerRow tokens + visibleSectionItems | — |
| 2 | 184-02 | Pure pagination type contracts (incl. PageBlockRef, safetyMarginPt) + `computePageBreaks()` engine (MAXIMAL keep-together chains, persistent continuation-header reservation, per-page margin) + rules, tested against a fake provider | 184-01 |
| 2 | 184-04 | Component restructure: split `PdfSectionBlock` (individually-keyed pieces); row-chunk `PdfPhotoGrid` (imports `photosPerRow` from tokens.ts); per-card-atomic `PdfTermsSection` (+ exported `PdfTermsCard` with `topMarginPt`); `wrap={false}` on totals container; real `LINE_HEIGHT` pinned; token-sourced call sites | 184-01 |
| 3 | 184-03 | Server-only fontkit/linebreak estimator + `blocksFromModel()` (empty-description filter via `visibleSectionItems`, visibility gates, ref population, pinned terms-card order, token-sourced geometry, exact ID naming, first-block height bonuses) | 184-01, 184-02 |
| 4 | 184-05 | Wire both PDF templates to N explicit `<Page>`s via ONE uniform keyed block dispatcher (prepared-by un-special-cased, terms-card via explicit map); repeated continuation headers (dual trigger); real-PDF-byte page count + determinism + renderToBuffer smoke; durable UAT artifacts + manual visual checkpoint | 184-01, 184-02, 184-03, 184-04 |

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Multi-page PDF looks right (headers repeat, no orphan/widow visual oddities, correct terms-card titles) | PGBRK-02/03/04 | Structural tests can't judge visuals | Plan 184-05 Task 4 (checkpoint:human-verify): 4 UAT PDFs written to `.planning/phases/184-consolidated-pagination-engine/uat/` + `184-HUMAN-UAT.md` checklist (status: partial) — durable evidence surviving auto-approval; open the PDFs, check breaks/repeated headers/footers/terms cards |

## Validation Sign-Off

- [x] All tasks must carry `<automated>` verify (planner contract)
- [x] Wave 0 = spike + arithmetic validation (the LOW-confidence items go first)
- [x] No watch-mode flags; feedback latency < 180s
- [x] `nyquist_compliant: true`

**Approval:** approved (orchestrator, from 184-RESEARCH.md Validation Architecture); revised (plan-checker, Opus, 2026-07-28, two rounds — 18+9 then 4+8).
