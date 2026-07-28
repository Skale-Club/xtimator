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

*Baseline expectations (from 183-RESEARCH.md), mapped to the actual plan/task that implements each:*

| Requirement | Test Type | What proves it |
|-------------|-----------|----------------|
| PDFPAR-01 | element-tree walk (reuse `tests/unit/estimate/_pdf-text-walker.ts`) | Both PDF templates render the benchmark's content order (header → title → info grid → summary → sections/subtotals → totals → terms → signature → photos); Classic title fill token asserted; Modern hairline treatment asserted (NOT solid-filled) |
| PDFPAR-02 | unit (all 4 surfaces) | Signed fixture → signature block present (signer name, formatted signed date, `<Image>` with data: URI src) in webview docs + both PDFs; unsigned fixture → absent |
| PDFPAR-03 | unit (all 4 surfaces) | Photo fixture with caption → caption text rendered under photo in webview grid + PDF grid; caption-less photo → no empty caption node |
| ENGINE-03 (closure) | static + structural | `components/pdf/shared/*` exists and both templates import from it; StyleSheet duplication measurably collapsed; existing PDF/cross-surface tests stay green across the refactor |
| Fonts | unit smoke | `Font.register` called once per family from a single shared registration module; renderToBuffer smoke test with registered fonts exits green |

### Real per-task verification map (plans as written)

| Plan-Task | Wave | Requirement(s) | Automated command |
|-----------|------|-----------------|--------------------|
| 183-01 Task 1 (shared fixture module) | 1 | PDFPAR-01/02/03, ENGINE-03 (infra) | `npx tsc -p tsconfig.ci.json --noEmit` |
| 183-01 Task 2 (pre-refactor PDF baseline order) | 1 | ENGINE-03 (regression anchor) | `npx vitest run tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` |
| 183-02 Task 1 (DocumentSignature type, signedBy label, isPercentageDiscount) | 1 | PDFPAR-01, PDFPAR-02 | `npx vitest run tests/unit/estimate/discount-display.test.ts tests/unit/estimate/document-label-parity.test.ts tests/unit/estimate/document-engine-boundary.test.ts` |
| 183-02 Task 2 (widen loadLatestSignedSnapshot, extract to estimate-signature.ts, thread into share.ts) | 1 | PDFPAR-02 | `npx vitest run tests/unit/share-query.test.ts` |
| 183-02 Task 3 (thread signature into PDF resolver + editor loader) | 1 | PDFPAR-02 | `npx vitest run tests/unit/pdf/render-estimate-pdf-resolver.test.ts tests/unit/whatsapp/pdf-delivery.test.ts && npx tsc -p tsconfig.ci.json --noEmit` |
| 183-03 Task 1 (vendor Inter + Lora TTFs + OFL licenses) | 1 | PDFPAR-01, ENGINE-03 | `test -s public/fonts/inter/Inter-Regular.ttf && test -s public/fonts/inter/Inter-Bold.ttf && test -s public/fonts/lora/Lora-Regular.ttf && test -s public/fonts/lora/Lora-Bold.ttf` |
| 183-03 Task 2 (Font.register module + tokens widening + smoke test) | 1 | PDFPAR-01, ENGINE-03 | `npx vitest run tests/unit/pdf/register-fonts.test.ts tests/unit/estimate/document-engine-boundary.test.ts tests/unit/estimate/pt-px-conversion-source.test.ts && npx tsc -p tsconfig.ci.json --noEmit` |
| 183-04 Task 1 (PdfHeader/PdfInfoGrid/PdfFooter) | 2 | PDFPAR-01, ENGINE-03 | `npx vitest run tests/unit/pdf/estimate-pdf-baseline-order.test.tsx tests/unit/pdf tests/unit/estimate/presentation-settings-cross-surface.test.tsx` |
| 183-04 Task 2 (PdfTitleBanner + PdfSectionBlock, Classic banner fix) | 2 | PDFPAR-01, ENGINE-03 | `npx vitest run tests/unit/pdf/estimate-pdf-banner-fill.test.tsx tests/unit/pdf/estimate-pdf-baseline-order.test.tsx tests/unit/pdf tests/unit/estimate/presentation-settings-cross-surface.test.tsx` |
| 183-04 Task 3 (PdfTermsSection) | 2 | PDFPAR-01, ENGINE-03 | `npx vitest run tests/unit/pdf tests/unit/estimate/presentation-settings-cross-surface.test.tsx tests/unit/pdf/estimate-pdf-baseline-order.test.tsx && npx tsc -p tsconfig.ci.json --noEmit` |
| 183-05 Task 1 (Classic webview signature + captions + editor state) | 2 | PDFPAR-02, PDFPAR-03 | `npx vitest run tests/unit/estimate/document-totals-view.test.tsx tests/unit/estimate/document-alignment.test.tsx tests/unit/workspace && npx tsc -p tsconfig.ci.json --noEmit` |
| 183-05 Task 2 (Modern webview signature + captions + share-page threading) | 2 | PDFPAR-02, PDFPAR-03 | `npx vitest run tests/unit/estimate/presentation-settings-cross-surface.test.tsx tests/unit/share-query.test.ts && npx tsc -p tsconfig.ci.json --noEmit` |
| 183-05 Task 3 (webview signature/caption tests) | 2 | PDFPAR-02, PDFPAR-03 | `npx vitest run tests/unit/estimate/document-signature-view.test.tsx tests/unit/estimate/document-photo-captions-view.test.tsx` |
| 183-06 Task 1 (PdfTotalsBlock variant + isPercentageDiscount) | 3 | PDFPAR-01, ENGINE-03 | `npx vitest run tests/unit/pdf/estimate-pdf-totals.test.tsx tests/unit/pdf/estimate-pdf-modern-totals.test.tsx tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` |
| 183-06 Task 2 (PdfPhotoGrid captions + PdfSignatureBlock net-new) | 3 | PDFPAR-02, PDFPAR-03, ENGINE-03 | `npx vitest run tests/unit/pdf/estimate-pdf-signature.test.tsx tests/unit/pdf/estimate-pdf-modern-signature.test.tsx tests/unit/pdf/estimate-pdf-photo-captions.test.tsx tests/unit/pdf/estimate-pdf-baseline-order.test.tsx tests/unit/pdf tests/unit/estimate/presentation-settings-cross-surface.test.tsx && npx tsc -p tsconfig.ci.json --noEmit` |
| 183-07 Task 1 (4-surface signature + caption cross-surface parity) | 4 | PDFPAR-02, PDFPAR-03 | `npx vitest run tests/unit/estimate/document-signature-caption-cross-surface.test.tsx` |
| 183-07 Task 2 (intentional baseline extension) | 4 | PDFPAR-01, PDFPAR-02, PDFPAR-03, ENGINE-03 | `npx vitest run tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` |
| 183-07 Task 3 (manual visual checkpoint) | 4 | PDFPAR-01, PDFPAR-02, PDFPAR-03 | Manual only — see plan's `<how-to-verify>` |

---

## Wave 0 Requirements

- [x] Signed-estimate + captioned-photo test fixtures (shared across the 4 surface tests) — `tests/unit/estimate/fixtures/document-fixtures.ts` (Plan 183-01 Task 1)
- [x] Baseline element-tree snapshot of both PDF templates BEFORE restructuring (regression anchor for the ENGINE-03 refactor) — `tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` (Plan 183-01 Task 2), intentionally extended post-refactor in Plan 183-07 Task 2

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual spacing/typography fidelity after StyleSheet collapse | ENGINE-03/PDFPAR-01 | No StyleSheet-value tests exist | Download PDF for classic + modern sample estimates; compare against pre-183 PDFs side by side — covered by Plan 183-07 Task 3 |
| Signature image renders correctly in a real PDF | PDFPAR-02 | Element-tree test can't prove raster output | Sign a staging estimate, download PDF, confirm signature image + name + date — covered by Plan 183-07 Task 3 (automated renderToBuffer smoke test in Plan 183-06 Task 2 proves the buffer is non-empty/valid PDF bytes, but not visual correctness) |

---

## Validation Sign-Off

- [x] All tasks must carry `<automated>` verify (planner contract) — satisfied except the single designated `checkpoint:human-verify` task (183-07 Task 3), which is manual-only by design
- [x] Wave 0 covers fixtures + baseline snapshot
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (orchestrator, from 183-RESEARCH.md Validation Architecture); per-task map populated by planning (2026-07-28) against the final 7-plan/4-wave structure.
