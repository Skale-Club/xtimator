---
phase: 183
slug: pdf-parity-content
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-28
---

# Phase 183 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit), tsc for types |
| **Config file** | `vitest.config.ts` / `tsconfig.ci.json` |
| **Quick run command** | `npx vitest run tests/unit/pdf tests/unit/estimate` |
| **Full suite command** | `npx vitest run tests/unit tests/eval && npx tsc -p tsconfig.ci.json --noEmit` |
| **Estimated runtime** | ~60-180 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to the touched area
- **After every plan wave:** Run the full suite command
- **Before phase verification:** Full suite must be green
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

*Populated by the planner in plan `<automated>` fields. Baseline expectations:*

| Requirement | Test Type | What proves it |
|-------------|-----------|----------------|
| PDFPAR-01 | element-tree walk (reuse `tests/unit/estimate/_pdf-text-walker.ts`) | Both PDF templates render the benchmark's content order (header → title → info grid → summary → sections/subtotals → totals → terms → signature → photos); Classic title fill token asserted; Modern hairline treatment asserted (NOT solid-filled) |
| PDFPAR-02 | unit (all 4 surfaces) | Signed fixture → signature block present (signer name, formatted signed date, `<Image>` with data: URI src) in webview docs + both PDFs; unsigned fixture → absent |
| PDFPAR-03 | unit (all 4 surfaces) | Photo fixture with caption → caption text rendered under photo in webview grid + PDF grid; caption-less photo → no empty caption node |
| ENGINE-03 (closure) | static + structural | `components/pdf/shared/*` exists and both templates import from it; StyleSheet duplication measurably collapsed; `document-engine-boundary.test.ts` extended to keep react-pdf imports out of `lib/estimate/document/` |
| Fonts | unit smoke | `Font.register` called once per family from a single shared registration module; renderToBuffer smoke test with registered fonts exits green |

---

## Wave 0 Requirements

- [ ] Signed-estimate + captioned-photo test fixtures (shared across the 4 surface tests)
- [ ] Baseline element-tree snapshot of both PDF templates BEFORE restructuring (regression anchor for the ENGINE-03 refactor)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual spacing/typography fidelity after StyleSheet collapse | ENGINE-03/PDFPAR-01 | No StyleSheet-value tests exist | Download PDF for classic + modern sample estimates; compare against pre-183 PDFs side by side |
| Signature image renders correctly in a real PDF | PDFPAR-02 | Element-tree test can't prove raster output | Sign a staging estimate, download PDF, confirm signature image + name + date |

---

## Validation Sign-Off

- [x] All tasks must carry `<automated>` verify (planner contract)
- [x] Wave 0 covers fixtures + baseline snapshot
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (orchestrator, from 183-RESEARCH.md Validation Architecture)
