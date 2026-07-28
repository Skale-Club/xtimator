---
phase: 184
slug: consolidated-pagination-engine
status: approved
nyquist_compliant: true
wave_0_complete: false
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

| Requirement | Proof |
|-------------|-------|
| PGBRK-01 | Engine unit tests: fixture estimates (small/medium/large/huge) → deterministic page-map snapshots; byte-stable across two runs in one test |
| PGBRK-02 | Rule unit tests per invariant: row never split; section header keeps ≥1 row; subtotal keeps with last row; totals/signature/terms-card atomic; photo grid breaks only between rows |
| PGBRK-03 | PDF structural tests: continuation page repeats items-table column header; every page footer shows computed "Page N of M" |
| PGBRK-04 | Template tests: N explicit `<Page>` elements matching the engine's page count for multi-page fixtures; single-page fixture → 1 Page; baseline-order tests updated intentionally |
| PGBRK-05 | Spike script `scripts/pagination-drift-spike.ts` (fontkit vs real-Chromium getClientRects) — output doc + derived `SAFETY_MARGIN` constant committed; estimator unit test with hand-calculated expected line counts |

## Wave 0 Requirements

- [ ] Spike script + drift report + SAFETY_MARGIN constant (blocks estimator finalization)
- [ ] Hand-calculated fontkit arithmetic unit test (validates the layout()/advanceWidth scale math before the estimator builds on it)

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Multi-page PDF looks right (headers repeat, no orphan/widow visual oddities) | PGBRK-02/03/04 | Structural tests can't judge visuals | Download PDFs for a 1-page and a 4+-page estimate, both templates; check breaks/repeated headers/footers |

## Validation Sign-Off

- [x] All tasks must carry `<automated>` verify (planner contract)
- [x] Wave 0 = spike + arithmetic validation (the LOW-confidence items go first)
- [x] No watch-mode flags; feedback latency < 180s
- [x] `nyquist_compliant: true`

**Approval:** approved (orchestrator, from 184-RESEARCH.md Validation Architecture)
