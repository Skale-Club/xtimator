---
phase: 183-pdf-parity-content
verified: 2026-07-28T08:32:05Z
status: passed
score: 9/9 must-haves verified (2 hygiene gaps closed post-verification by orchestrator — commits abfcc6b0, 92524bda: ENGINE-03 traceability row updated to Complete with measured line counts; resolver-test snapshot mock fixtures typed correctly, bare tsc back to the 11 pre-existing unrelated errors)
gaps:
  - truth: "ENGINE-03 closes honestly — the PDF template pair is genuinely composed from shared structure AND the traceability record says so"
    status: partial
    reason: "The CODE half is fully done and verified (template pair went 860/861 -> 519/536 lines, all 9 regions extracted to components/pdf/shared/, both templates compose all 9). The RECORD half was not updated: the traceability row still reads 'Partial' with forward-looking language claiming the de-dup 'completes in Phase 183', even though Phase 183 is complete and the requirement checkbox is already [x]."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "Line 79 traceability row: `| ENGINE-03 | Phase 182 + 183 | Partial (182: per-template token layer; structural de-dup of the PDF template pair completes in Phase 183 with PDFPAR-01) |` — stale forward-looking status. Line 26 checkbox is already `[x]`, so the table and the checklist now contradict each other."
    missing:
      - "Update .planning/REQUIREMENTS.md line 79 to `| ENGINE-03 | Phase 182 + 183 | Complete |` (or 'Complete (182: per-template token layer; 183: structural de-dup of the PDF template pair)'), matching the already-checked [x] on line 26."
  - truth: "Phase 183 leaves the repo's type surface no worse than it found it"
    status: failed
    reason: "Phase 183 introduced 1 net-new whole-repo type error, in a test file the phase itself created, against a type the phase itself widened. deferred-items.md mis-attributes it as pre-existing. Verified by git: tests/unit/pdf/render-estimate-pdf-resolver.test.ts did NOT exist at the pre-phase commit 35d357bf (+189 lines in this phase's diff), and LatestSignedSnapshotRow had no signer_name/signature_data before Plan 183-02 widened it. Invisible to both CI gates (tsconfig.ci.json excludes tests/**; vitest does not typecheck), so it will not block deploy — but it regresses the 'bare tsc clean' baseline."
    artifacts:
      - path: "tests/unit/pdf/render-estimate-pdf-resolver.test.ts"
        issue: "Line 96: mocked snapshot row is missing `signer_name` / `signature_data`, both now required on LatestSignedSnapshotRow (widened by Plan 183-02). TS2345."
      - path: ".planning/phases/183-pdf-parity-content/deferred-items.md"
        issue: "Characterizes this error as 'pre-existing ... exist independently of any 183-06 change' and 'the fixture drift predates 183-06'. True only relative to plan 183-06; false at the phase level — Phase 183 created both the file and the type widening."
    missing:
      - "Add `signer_name: 'Test Signer'` and `signature_data: 'data:image/png;base64,...'` to the mocked snapshot row at tests/unit/pdf/render-estimate-pdf-resolver.test.ts:96 so bare `npx tsc --noEmit` drops from 12 errors to the 11 genuinely pre-existing ones."
      - "Correct deferred-items.md's attribution: this error is Phase-183-caused (Plan 183-02 widening + Plan 183-02/03 test creation), not pre-existing."
human_verification:
  - test: "Spacing/typography fidelity after the StyleSheet collapse"
    expected: "Classic and Modern PDFs for the same sample estimate look equivalent in spacing, padding, and font rendering vs a pre-183 PDF (or the current webview render)"
    why_human: "No automated StyleSheet-value test coverage exists (Pitfall 6) — structural order is tested, visual metrics are not"
  - test: "Modern PDF stays hairline/fill-free"
    expected: "Modern ESTIMATE title and every section header are accent-colored text with a thin rule only — no solid brand-color fill anywhere"
    why_human: "Automated negative test passes at the JSX-tree level; only a rendered PDF confirms the visual result"
  - test: "Signature image renders correctly in a real PDF"
    expected: "Signature is a legible raster of the drawn signature (not a broken-image icon or blank box), between Terms and Photos, with signer name and signed date beside it"
    why_human: "data: URI -> react-pdf <Image> rasterization cannot be asserted from the component tree"
  - test: "OWNER DECISION — confirm Correction 1's scope"
    expected: "Owner confirms the fill went to Classic PDF only (Modern locked fill-free behind a negative test), contradicting CONTEXT.md's original wording"
    why_human: "Scope/intent decision, not a code fact"
---

# Phase 183: PDF Parity Content Verification Report

**Phase Goal:** The PDF (both templates) matches the webview benchmark's full document structure, and both the webview and PDF gain the signature block and visible photo captions neither surface renders today.
**Verified:** 2026-07-28T08:32:05Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                          | Status     | Evidence                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Signed estimate's PDF (Classic + Modern) shows signer name, signed date, signature image        | ✓ VERIFIED | `PdfSignatureBlock` mounted in both templates (estimate-pdf.tsx:487, estimate-pdf-modern.tsx:504); renders `<Image src={signature.signatureDataUrl}>` + name + `fmtDate`      |
| 2   | Signed estimate's webview (Classic + Modern) shows the same 3 facts                             | ✓ VERIFIED | estimate-document.tsx:1762-1780 and estimate-document-modern.tsx:423-441 — both render img + signerName + formatDate(signedAt)                                                |
| 3   | Photo caption visible beneath photo on all 4 surfaces; no empty node when caption is null       | ✓ VERIFIED | PDF: pdf-photo-grid.tsx:47-51 (`{photo.caption && ...}`). Webview: estimate-document.tsx:1301, estimate-document-modern.tsx:462. Cross-surface test asserts exactly-once      |
| 4   | PDF mirrors webview's full structure incl. locked totals order                                  | ✓ VERIFIED | Both templates compose header→title→info-grid→summary→sections(+subtotals)→totals→terms→signature→photos→footer; totals order locked in pdf-totals-block.tsx:96-127 / 137-167 |
| 5   | Classic PDF gains solid brand banner; Modern stays hairline (locked by negative test)           | ✓ VERIFIED | pdf-title-banner.tsx branches on `solidFill`; tokens set classic=true / modern=false; estimate-pdf-banner-fill.test.tsx asserts Modern has NO brand fill anywhere             |
| 6   | Both templates composed from 9 shared components with per-template tokens                       | ✓ VERIFIED | All 9 exist under components/pdf/shared/; both templates import all 9 (estimate-pdf.tsx:32-40, estimate-pdf-modern.tsx:35-43) and invoke each                                 |
| 7   | Unsigned estimate → no signature block on ANY of the 4 surfaces                                 | ✓ VERIFIED | `if (!signature) return null` (pdf-signature-block.tsx:35); `{data.signature && ...}` on both webviews; cross-surface test asserts absence on all 4                           |
| 8   | Fonts vendored, valid, registered, and provably loadable                                        | ✓ VERIFIED | 4 TTFs with valid `00010000` sfnt magic bytes; OFL.txt in both dirs; README with source URLs/version/date; both templates side-effect-import register-fonts; renderToBuffer smoke passes |
| 9   | ENGINE-03 closes honestly — code AND traceability record                                        | ⚠️ PARTIAL | Code half fully done (see below). Traceability row still says "Partial ... completes in Phase 183" while the checkbox is already `[x]` — see Gap 1                            |

**Score:** 8/9 truths verified (1 partial)

All 4 ROADMAP Success Criteria (truths 1-4) are **fully verified**. The single partial (truth 9) is a documentation-record gap, not a functional one.

### Required Artifacts

| Artifact                                            | Expected                                       | Status     | Details                                                              |
| --------------------------------------------------- | ---------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| `components/pdf/shared/pdf-header.tsx`              | Shared company header                          | ✓ VERIFIED | 153 lines, `Style`-typed, consumed by both                            |
| `components/pdf/shared/pdf-info-grid.tsx`           | Project/bill-to grid                           | ✓ VERIFIED | 126 lines, `Style`-typed, consumed by both                            |
| `components/pdf/shared/pdf-title-banner.tsx`        | Title, solid-fill vs hairline branch           | ✓ VERIFIED | 69 lines; `solidFill` prop drives the branch                          |
| `components/pdf/shared/pdf-section-block.tsx`       | Section header + table + subtotal              | ✓ VERIFIED | 123 lines; reads `solidFill`; `key` on outermost View (direct-call)   |
| `components/pdf/shared/pdf-totals-block.tsx`        | classic/modern variant totals                  | ✓ VERIFIED | 171 lines; two genuinely distinct JSX trees (Pitfall 2 respected)     |
| `components/pdf/shared/pdf-terms-section.tsx`       | Terms/payment/warranty/timeline/notes          | ✓ VERIFIED | 102 lines, resolver-gated                                             |
| `components/pdf/shared/pdf-signature-block.tsx`     | Net-new signature renderer                     | ✓ VERIFIED | 49 lines; data-presence gated; `wrap={false}`                         |
| `components/pdf/shared/pdf-photo-grid.tsx`          | Photo grid + per-photo captions                | ✓ VERIFIED | 57 lines; conditional caption Text                                    |
| `components/pdf/shared/pdf-footer.tsx`              | Page-number footer                             | ✓ VERIFIED | 32 lines                                                              |
| `lib/queries/estimate-signature.ts`                 | Widened shared signature query                 | ✓ VERIFIED | Selects `signer_name, signature_data`; 4 real consumers                |
| `lib/estimate/discount-display.ts`                  | `isPercentageDiscount` predicate               | ✓ VERIFIED | Adopted by all 3 document renderers                                   |
| `lib/pdf/register-fonts.ts`                         | One Font.register call site                    | ✓ VERIFIED | 4 families; imported by both templates at line 8                      |
| `public/fonts/**`                                   | TTFs + OFL + README                            | ✓ VERIFIED | 4 valid TTFs, 2 OFL.txt, README with source URLs                      |
| `tests/unit/estimate/fixtures/document-fixtures.ts` | Shared fixtures                                | ✓ VERIFIED | 227 lines; reused by baseline, cross-surface, and per-surface tests   |
| `tests/unit/pdf/estimate-pdf-banner-fill.test.tsx`  | Positive + negative banner guard               | ✓ VERIFIED | Modern negative assertion is unconditional (`false` for whole tree)   |
| `tests/unit/pdf/register-fonts.test.ts`             | renderToBuffer smoke                           | ✓ VERIFIED | Real render, asserts `%PDF` magic — no react-pdf mocking              |
| `.../document-signature-caption-cross-surface.test.tsx` | 4-surface parity proof                     | ✓ VERIFIED | 170 lines; signed + unsigned cases across all 4 surfaces             |
| `183-HUMAN-UAT.md`                                  | 4 UAT items incl. owner decision               | ✓ VERIFIED | 4 items present; item 4 is the Correction-1 owner-decision line       |

**Style typing:** zero bare `object` style fields across `components/pdf/**` — all 9 shared components import `Style` from `@react-pdf/types`.

### Key Link Verification

| From                             | To                                    | Via                                                | Status  | Details                                                            |
| -------------------------------- | ------------------------------------- | -------------------------------------------------- | ------- | ------------------------------------------------------------------ |
| both PDF templates               | all 9 `shared/pdf-*`                  | import + direct function invocation                 | ✓ WIRED | Direct-call pattern documented in pdf-header.tsx:8-17 (text-walker) |
| `render-estimate-pdf.ts`         | `lib/queries/estimate-signature.ts`   | `import { loadLatestSignedSnapshot }`               | ✓ WIRED | Line 28; called line 96                                            |
| `render-estimate-pdf.ts`         | both PDF templates                    | `createElement(PDFComponent, { ..., signature })`   | ✓ WIRED | Line 195; guards on both `signer_name && signature_data`           |
| `lib/queries/estimate.ts`        | `lib/queries/estimate-signature.ts`   | `loadLatestSignedSnapshot(requireServiceClient(),…)`| ✓ WIRED | Line 203, inside the existing `Promise.all`                        |
| `lib/queries/share.ts`           | `lib/queries/estimate-signature.ts`   | permanent import for its own 2 call sites           | ✓ WIRED | Line 13; call sites 168 + 416                                      |
| `share.ts` transitional re-export| —                                     | bare `export { loadLatestSignedSnapshot }`          | ✓ DELETED | Task 3 obligation met — no re-export line remains                 |
| `estimate-view.tsx`              | webview signature block               | `documentData.signature` from share row             | ✓ WIRED | Lines 199-206; feeds both Classic and Modern doc components        |
| `use-estimate-reducer.ts`        | `EstimateWithSections.signature`      | `(estimate as {signature?}).signature ?? null`      | ✓ WIRED | Line 368                                                           |
| both templates                   | `lib/pdf/register-fonts.ts`           | side-effect import before StyleSheet.create()       | ✓ WIRED | Line 8 in each                                                     |
| `tokens.ts`                      | `register-fonts.ts`                   | family-name string match                            | ✓ WIRED | `'Inter'/'Inter-Bold'/'Lora'/'Lora-Bold'` match exactly            |
| `pdf-totals-block.tsx`           | `lib/estimate/discount-display.ts`    | `isPercentageDiscount(estimate.discount_type)`      | ✓ WIRED | Line 75                                                            |

### Data-Flow Trace (Level 4)

| Artifact                     | Data Variable            | Source                                                  | Produces Real Data | Status     |
| ---------------------------- | ------------------------ | ------------------------------------------------------- | ------------------ | ---------- |
| `PdfSignatureBlock` (PDF)    | `signature` prop         | `estimate_signatures` SELECT → resolver → createElement  | Yes (real DB query)| ✓ FLOWING  |
| Classic webview signature    | `data.signature`         | share.ts SELECT → `signerName`/`signatureImageDataUrl`   | Yes                | ✓ FLOWING  |
| Modern webview signature     | `data.signature`         | same `documentData` object as Classic                    | Yes                | ✓ FLOWING  |
| Workspace editor signature   | `state.signature`        | estimate.ts `Promise.all` → reducer initState line 368   | Yes                | ✓ FLOWING  |
| `PdfPhotoGrid` captions      | `photos[].caption`       | `attachedPhotos` (signed URLs resolved server-side)      | Yes                | ✓ FLOWING  |
| Font registration            | TTF file bytes           | `public/fonts/**` via `process.cwd()`                    | Yes (valid sfnt)   | ✓ FLOWING  |

**Signature is prop-driven, confirmed:** `grep "estimate.signature" components/pdf/` returns **nothing** — neither template derives signature off the estimate row; both receive it as an explicit `signature?: DocumentSignature | null` prop resolved upstream.

**No double-render conflict in `estimate-view.tsx`:** the capture pad is gated `showSignaturePad && !responded` (line 408) with `requiresSignature = digital_signature_enabled && !alreadyResponded` (line 123); the display block is data-presence gated on `signerName && signatureImageDataUrl` (line 200), which is only populated after a signature row exists. Pad and display block are mutually exclusive in practice.

### Behavioral Spot-Checks

| Behavior                                        | Command                                                          | Result                                     | Status  |
| ----------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ | ------- |
| Scoped CI typecheck (the deploy gate)           | `npx tsc -p tsconfig.ci.json --noEmit`                            | exit 0, 0 errors                            | ✓ PASS  |
| Full unit + eval suite                          | `npx vitest run tests/unit tests/eval`                            | 572 files passed, 1 skipped; 4709 passed, 21 todo | ✓ PASS  |
| Phase-183 targeted tests                        | `npx vitest run tests/unit/pdf tests/unit/estimate/document-signature*` | 12 files passed, 43 tests passed      | ✓ PASS  |
| Fonts embed in a real PDF                       | renderToBuffer smoke (register-fonts.test.ts)                     | buffer starts with `%PDF`                   | ✓ PASS  |
| Font file integrity                             | first-4-bytes hex on all 4 TTFs                                   | all `00010000` (valid TrueType sfnt)        | ✓ PASS  |
| Whole-repo typecheck                            | `npx tsc --noEmit`                                                | exit 2, **12 errors** (11 pre-existing, 1 phase-caused) | ✗ FAIL |

### ENGINE-03 Structural De-duplication (measured, not claimed)

| Metric                              | Pre-183 (commit `35d357bf`) | Post-183 | Delta        |
| ----------------------------------- | --------------------------- | -------- | ------------ |
| `estimate-pdf.tsx` lines            | 860                         | 519      | −341         |
| `estimate-pdf-modern.tsx` lines     | 861                         | 536      | −325         |
| Template-pair total                 | 1721                        | 1055     | **−666**     |
| `components/pdf/shared/**` lines    | 0 (dir did not exist)       | 872      | +872 (shared once) |
| StyleSheet keys per template        | —                           | 44 / 44  | per-template tokens retained |
| StyleSheet region size              | —                           | 227 / 236 lines | design values stay per-template |
| Composition-root divergence         | —                           | 31 diff lines of ~208 | ~85% identical plumbing |

The de-duplication is **genuine**: 666 lines of previously byte-duplicated JSX were removed from the pair and replaced by 872 lines defined once (a large share of which is doc comments and explicit prop interfaces). What remains per-template is exactly what should: the StyleSheet (design tokens) plus a composition root that passes per-template style slices. The residual ~85% similarity between the two composition roots is the inherent plumbing cost of the "pass a styles object" pattern, not leftover structural duplication — each of the 9 document regions now has exactly one definition.

**The code side of ENGINE-03 is closed.** Only the traceability record was not updated (Gap 1).

### Requirements Coverage

| Requirement | Source Plan             | Description                                     | Status       | Evidence                                                                     |
| ----------- | ----------------------- | ----------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| PDFPAR-01   | 183-03/04/06            | PDF matches webview structure and design        | ✓ SATISFIED  | Both templates compose all 9 regions; Classic banner closed; totals order locked; fonts match web |
| PDFPAR-02   | 183-02/05/06/07         | Signature block on webview AND PDF, net-new     | ✓ SATISFIED  | 4-surface cross-surface test passes signed + unsigned                        |
| PDFPAR-03   | 183-05/06/07            | Photo captions in webview AND PDF photo grids   | ✓ SATISFIED  | Captions on all 4 surfaces; exactly-once assertion guards empty nodes        |
| ENGINE-03   | 183-04/06 (closure)     | Shared structure + template-specific styling    | ⚠️ CODE DONE, RECORD STALE | −666 duplicated lines, 9 shared components; traceability row still "Partial" |

No orphaned requirements: REQUIREMENTS.md maps only PDFPAR-01/02/03 (+ ENGINE-03 partial) to Phase 183, and every one is claimed by at least one plan.

### Anti-Patterns Found

| File                                        | Line | Pattern                                | Severity   | Impact                                                                                       |
| ------------------------------------------- | ---- | -------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `tests/unit/pdf/render-estimate-pdf-resolver.test.ts` | 96 | Incomplete mock fixture (TS2345) | ⚠️ Warning | Phase-caused type error; invisible to both CI gates, so it silently rots the bare-tsc baseline |
| `deferred-items.md`                         | —    | Mis-attributed causation               | ⚠️ Warning | Records a phase-caused error as pre-existing, which would suppress follow-up                  |
| `.planning/REQUIREMENTS.md`                 | 79   | Stale forward-looking status           | ⚠️ Warning | Traceability table contradicts its own `[x]` checkbox on line 26                              |

Scans that came back **clean**: no `TODO`/`FIXME`/`XXX`/`HACK`/placeholder text anywhere in `components/pdf/**`, `lib/pdf/**`, `lib/queries/estimate-signature.ts`, or `lib/estimate/discount-display.ts`. The two `return null` statements in the shared components (`pdf-signature-block.tsx:35`, `pdf-terms-section.tsx:64`) are intentional data-presence/visibility gates required by the spec, not stubs. No leftover `Helvetica`/`Times-Roman` references outside one explanatory comment.

### Human Verification Required

All 4 items in `183-HUMAN-UAT.md` remain genuinely `[pending]` (auto-approved under the project's standing yolo checkpoint policy, but not actually performed):

1. **Spacing/typography fidelity after the StyleSheet collapse** — download Classic and Modern PDFs for one sample estimate and compare side-by-side against a pre-183 PDF (or the current webview). No automated StyleSheet-value coverage exists.
2. **Modern PDF stays hairline/fill-free** — confirm the rendered Modern PDF's title and section headers show no solid brand fill.
3. **Signature image renders correctly in a real PDF** — confirm the signature is a legible raster, not a broken-image icon or blank box, positioned between Terms and Photos.
4. **OWNER DECISION — confirm Correction 1's scope** — Phase 183 gave the solid banner to **Classic only** and locked Modern fill-free behind a negative test, contradicting CONTEXT.md's original wording (source shows Modern webview never fills; the owner's reference screenshot was the Classic template). Owner must confirm or reopen.

### Gaps Summary

The phase **achieved its goal**. All 4 ROADMAP Success Criteria are verified against real source, both CI gates are green, and the ENGINE-03 de-duplication is genuine and measurable (−666 duplicated lines, 9 single-definition shared regions, per-template tokens retained). Signature and captions land on all 4 surfaces, are prop-driven rather than derived, are absent when unsigned/uncaptioned, and are proven consistent by a real 4-surface parity test. The transitional re-export was correctly deleted. The fonts are real, valid, licensed, documented, and proven loadable by an unmocked `renderToBuffer` call.

Two gaps remain, both hygiene rather than function:

1. **ENGINE-03's traceability row was never updated.** The code closed; the record still says "Partial ... completes in Phase 183", now contradicting its own `[x]` checkbox. One-line fix.

2. **The phase introduced one type error and then mis-filed it.** `tests/unit/pdf/render-estimate-pdf-resolver.test.ts` was created by this phase (+189 lines, absent at `35d357bf`) and its mock fixture does not satisfy `LatestSignedSnapshotRow`, which this same phase widened in Plan 183-02. `deferred-items.md` describes it as pre-existing — accurate only relative to plan 183-06, misleading at the phase level. Because `tsconfig.ci.json` excludes `tests/**` and vitest does not typecheck, **neither CI gate can see it**, which is precisely the silent-rot failure mode project memory warns about. 11 of the 12 bare-`tsc` errors are genuinely pre-existing (demo/e2e test files this phase never touched); this 1 is not.

Neither gap blocks the deploy pipeline or affects production code. Both are small, well-scoped follow-ups.

---

_Verified: 2026-07-28T08:32:05Z_
_Verifier: Claude (gsd-verifier)_
