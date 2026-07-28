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

**Wave-1 same-wave-tsc note (plan-checker WARNING 13iii, final pass):** Plans 183-02 and 183-03 both run in Wave 1 and both invoke `npx tsc -p tsconfig.ci.json --noEmit` in some of their own tasks. If either plan's `tsc` run reports errors ONLY in files owned by the OTHER plan (`components/pdf/*` + `lib/estimate/document/tokens.ts` belong to 183-03; `lib/queries/*` + `lib/pdf/render-estimate-pdf.ts` belong to 183-02), that is a transient same-wave artifact — re-run after the sibling plan's relevant task commits. Never edit another plan's file to silence it.

**Wave-2 exception (plan-checker WARNING 6 / WARNING 13, final state):** Plans 183-04 and 183-05 run in parallel in Wave 2, editing disjoint files but with a test-level overlap risk — the 6-surface `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` RTL-renders BOTH webview templates (183-05's territory) AND both PDF templates (183-04's territory) in one test file, and a whole-repo `tsc` gate can be red mid-wave while either plan is between commits. Concretely, as the plans now read:
- 183-04's 3 tasks run PDF-scoped vitest only (`tests/unit/pdf`, `estimate-pdf-baseline-order.test.tsx`, `estimate-pdf-banner-fill.test.tsx`) — none of its 3 tasks runs the 6-surface cross-surface test or a whole-repo `tsc`.
- 183-05's 3 tasks run webview-scoped vitest only (Task 1: `document-totals-view.test.tsx` + `document-alignment.test.tsx` + `tests/unit/workspace`; Task 2: `share-query.test.ts` + `document-totals-view.test.tsx`; Task 3: the 2 new signature/caption test files) — none of its 3 tasks runs the 6-surface cross-surface test or a whole-repo `tsc` either.
Both the cross-surface test and the whole-repo `tsc` gate are deferred to the orchestrator's full-suite run at the wave-2 boundary (after BOTH 183-04 and 183-05 complete), which remains the authoritative check per the Sampling Rate above.

---

## Per-Task Verification Map

*Baseline expectations (from 183-RESEARCH.md), mapped to the actual plan/task that implements each:*

| Requirement | Test Type | What proves it |
|-------------|-----------|----------------|
| PDFPAR-01 | element-tree walk (reuse `tests/unit/estimate/_pdf-text-walker.ts`) | Both PDF templates render the benchmark's content order (header → title → info grid → summary → sections/subtotals → totals → terms → signature → photos); Classic title fill token asserted; Modern hairline treatment asserted (NOT solid-filled) |
| PDFPAR-02 | unit (all 4 surfaces) | Signed fixture → signature block present (signer name, formatted signed date, `<Image>` with data: URI src) in webview docs + both PDFs; unsigned fixture → absent |
| PDFPAR-03 | unit (all 4 surfaces) | Photo fixture with caption → caption text rendered under photo in webview grid + PDF grid; caption-less photo → no empty caption node |
| ENGINE-03 (closure) | static + structural | `components/pdf/shared/*` exists and both templates import from it; StyleSheet duplication measurably collapsed; existing PDF/cross-surface tests stay green across the refactor |
| Fonts | unit smoke | `Font.register` called once per family from a single shared registration module; renderToBuffer smoke test with registered fonts exits green (TTF magic-byte check on the vendored files too) |

### Real per-task verification map (plans as written, revised 2026-07-28 — 2 checker passes)

| Plan-Task | Wave | Requirement(s) | Automated command |
|-----------|------|-----------------|--------------------|
| 183-01 Task 1 (shared fixture module) | 1 | PDFPAR-01/02/03, ENGINE-03 (infra) | `npx tsc --noEmit --skipLibCheck --strict --target es2022 --module esnext --moduleResolution bundler tests/unit/estimate/fixtures/document-fixtures.ts` — standalone-file typecheck, NOT a bare or `-p tsconfig.ci.json` whole-repo run (BLOCKER 12, final pass: bare `tsc` is red today from 11 pre-existing, unrelated errors in `tests/unit/demo/*` + e2e; the scoped `tsconfig.ci.json` variant is vacuous since it excludes `tests/**` entirely) |
| 183-01 Task 2 (pre-refactor PDF baseline order) | 1 | ENGINE-03 (regression anchor) | `npx vitest run tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` |
| 183-02 Task 1 (DocumentSignature type, signedBy label, isPercentageDiscount) | 1 | PDFPAR-01, PDFPAR-02 | `npx vitest run tests/unit/estimate/discount-display.test.ts tests/unit/estimate/document-label-parity.test.ts tests/unit/estimate/document-engine-boundary.test.ts` |
| 183-02 Task 2 (widen loadLatestSignedSnapshot, extract to estimate-signature.ts + PERMANENT local import + TRANSITIONAL re-export in share.ts, thread into share.ts's payload) | 1 | PDFPAR-02 | `npx vitest run tests/unit/share-query.test.ts && npx tsc -p tsconfig.ci.json --noEmit && npx vitest run tests/unit/whatsapp/pdf-delivery.test.ts tests/unit/pdf/render-estimate-pdf-resolver.test.ts` (BLOCKER 2 — proves the transitional re-export closes the red window; BLOCKER 11, final pass — `share.ts` now carries BOTH a permanent local `import { loadLatestSignedSnapshot }` for its own 2 call sites AND a separate transitional bare `export { loadLatestSignedSnapshot }` line, not one line serving both purposes) |
| 183-02 Task 3 (thread signature into PDF resolver via type cast + workspace-editor loader; delete ONLY the transitional re-export, keep the import) | 1 | PDFPAR-02 | `npx vitest run tests/unit/pdf/render-estimate-pdf-resolver.test.ts tests/unit/whatsapp/pdf-delivery.test.ts tests/unit/share-query.test.ts && npx tsc -p tsconfig.ci.json --noEmit` (MINOR 15, final pass — the type-cast acceptance check now tolerates bare `ComponentType` or `React.ComponentType`, matching this file's actual no-`React`-namespace-import convention) |
| 183-03 Task 1 (vendor Inter + Lora TTFs + OFL licenses) | 1 | PDFPAR-01, ENGINE-03 | `test -s <4 ttf paths>` (non-empty) `&&` a `head -c4 \| od -An -tx1 \| tr -d ' \n' \| grep -qi '^00010000'` TTF-magic-bytes check per file (INFO 10 — proves real font binaries, not just non-empty placeholders) |
| 183-03 Task 2 (Font.register module + tokens widening + smoke test) | 1 | PDFPAR-01, ENGINE-03 | `npx vitest run tests/unit/pdf/register-fonts.test.ts tests/unit/estimate/document-engine-boundary.test.ts tests/unit/estimate/pt-px-conversion-source.test.ts && npx tsc -p tsconfig.ci.json --noEmit` |
| 183-04 Task 1 (PdfHeader/PdfInfoGrid/PdfFooter) | 2 | PDFPAR-01, ENGINE-03 | `npx vitest run tests/unit/pdf/estimate-pdf-baseline-order.test.tsx tests/unit/pdf` (cross-surface test + whole-repo tsc both deferred to wave-2 boundary) |
| 183-04 Task 2 (PdfTitleBanner + PdfSectionBlock, Classic banner fix) | 2 | PDFPAR-01, ENGINE-03 | `npx vitest run tests/unit/pdf/estimate-pdf-banner-fill.test.tsx tests/unit/pdf/estimate-pdf-baseline-order.test.tsx tests/unit/pdf` |
| 183-04 Task 3 (PdfTermsSection) | 2 | PDFPAR-01, ENGINE-03 | `npx vitest run tests/unit/pdf tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` (WARNING 13ii, final pass — whole-repo `tsc` REMOVED from this task's own verify, deferred to the wave-2 boundary same as its sibling tasks) |
| 183-05 Task 1 (Classic webview signature + captions + discount predicate + editor state) | 2 | PDFPAR-01 (discount), PDFPAR-02, PDFPAR-03 | `npx vitest run tests/unit/estimate/document-totals-view.test.tsx tests/unit/estimate/document-alignment.test.tsx tests/unit/workspace` (whole-repo tsc deferred to wave-2 boundary) |
| 183-05 Task 2 (Modern webview signature + captions + discount predicate + share-page threading) | 2 | PDFPAR-01 (discount), PDFPAR-02, PDFPAR-03 | `npx vitest run tests/unit/share-query.test.ts tests/unit/estimate/document-totals-view.test.tsx` (WARNING 13i, final pass — webview-only; the 6-surface cross-surface test, which also RTL/direct-renders both PDF templates Plan 183-04 is concurrently mid-editing, is now REMOVED from this task and deferred to the wave-2 boundary) |
| 183-05 Task 3 (webview signature/caption tests, dates computed via formatDate) | 2 | PDFPAR-02, PDFPAR-03 | `npx vitest run tests/unit/estimate/document-signature-view.test.tsx tests/unit/estimate/document-photo-captions-view.test.tsx` |
| 183-06 Task 1 (PdfTotalsBlock variant + isPercentageDiscount) | 3 | PDFPAR-01, ENGINE-03 | `npx vitest run tests/unit/pdf/estimate-pdf-totals.test.tsx tests/unit/pdf/estimate-pdf-modern-totals.test.tsx tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` |
| 183-06 Task 2 (PdfPhotoGrid captions + PdfSignatureBlock net-new + real EstimatePDFProps.signature) | 3 | PDFPAR-02, PDFPAR-03, ENGINE-03 | `npx vitest run tests/unit/pdf/estimate-pdf-signature.test.tsx tests/unit/pdf/estimate-pdf-modern-signature.test.tsx tests/unit/pdf/estimate-pdf-photo-captions.test.tsx tests/unit/pdf/estimate-pdf-baseline-order.test.tsx tests/unit/pdf tests/unit/estimate/presentation-settings-cross-surface.test.tsx && npx tsc -p tsconfig.ci.json --noEmit` (now also grep-guarded: `signature` is a prop, never read off `estimate` — WARNING 7; dates computed via `formatDate` — WARNING 8; this is Wave 3, single-plan, so the cross-surface test + tsc are safe to run here — no same-wave sibling plan is mid-edit) |
| 183-07 Task 1 (4-surface signature + caption cross-surface parity, verbatim render calls) | 4 | PDFPAR-02, PDFPAR-03 | `npx vitest run tests/unit/estimate/document-signature-caption-cross-surface.test.tsx` |
| 183-07 Task 2 (intentional baseline extension) | 4 | PDFPAR-01, PDFPAR-02, PDFPAR-03, ENGINE-03 | `npx vitest run tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` |
| 183-07 Task 3 (manual visual checkpoint + persisted 183-HUMAN-UAT.md) | 4 | PDFPAR-01, PDFPAR-02, PDFPAR-03 | Manual only — see plan's `<how-to-verify>`; durable record now created via `183-HUMAN-UAT.md` (4 entries: spacing/typography fidelity, Modern-stays-hairline, signature raster check, owner decision on Correction 1's scope — BLOCKER 4; `183-HUMAN-UAT.md` is now declared in 183-07's frontmatter `files_modified` and Task 3's `<files>` tag — MINOR 14) |

Plan-level gate (183-07's `<verification>`, narrowed per BLOCKER 3): `grep -rn "discount_type === 'percentage'" components/pdf components/share components/workspace/estimate/estimate-document.tsx` returns nothing. Deliberately scoped to exclude `components/workspace/estimate/use-estimate-reducer.ts:220`, which is the intentional, out-of-scope client-preview totals-math recompute (not a display-suffix decision) — a bare `components/` grep would misreport it as a missed call site.

---

## Wave 0 Requirements

- [x] Signed-estimate + captioned-photo test fixtures (shared across the 4 surface tests) — `tests/unit/estimate/fixtures/document-fixtures.ts` (Plan 183-01 Task 1); `SIGNATURE_FIXTURE.signedAt` is date-only for timezone-deterministic assertions (WARNING 8)
- [x] Baseline element-tree snapshot of both PDF templates BEFORE restructuring (regression anchor for the ENGINE-03 refactor) — `tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` (Plan 183-01 Task 2), intentionally extended post-refactor in Plan 183-07 Task 2

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual spacing/typography fidelity after StyleSheet collapse | ENGINE-03/PDFPAR-01 | No StyleSheet-value tests exist | Download PDF for classic + modern sample estimates; compare against pre-183 PDFs side by side — covered by Plan 183-07 Task 3, persisted as UAT entry 1 |
| Signature image renders correctly in a real PDF | PDFPAR-02 | Element-tree test can't prove raster output | Sign a staging estimate, download PDF, confirm signature image + name + date — covered by Plan 183-07 Task 3, persisted as UAT entry 3 (automated renderToBuffer smoke test in Plan 183-06 Task 2 proves the buffer is non-empty/valid PDF bytes, but not visual correctness) |
| Modern PDF stays hairline/fill-free (Pitfall-1 negative case) | PDFPAR-01 | Requires human eyes on the rendered output, not just an element-tree `style`-prop assertion | Covered by Plan 183-07 Task 3, persisted as UAT entry 2 |
| Owner confirmation of Correction 1's scope (Classic-only banner fill) | PDFPAR-01 | Product decision, not a test | Covered by Plan 183-07 Task 3, persisted verbatim as UAT entry 4 (BLOCKER 4) |

---

## Validation Sign-Off

- [x] All tasks must carry `<automated>` verify (planner contract) — satisfied except the single designated `checkpoint:human-verify` task (183-07 Task 3), which is manual-only by design and now persists its outcome to `183-HUMAN-UAT.md`
- [x] Wave 0 covers fixtures + baseline snapshot
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (orchestrator, from 183-RESEARCH.md Validation Architecture); per-task map populated by planning (2026-07-28) against the final 7-plan/4-wave structure; revised twice on 2026-07-28 — first pass: 4 blockers + 4 warnings + 2 info; second/final pass: 2 blockers + 3 minors (both targeted revisions, no replan).
