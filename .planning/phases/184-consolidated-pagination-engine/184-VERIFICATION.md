---
phase: 184-consolidated-pagination-engine
verified: 2026-07-28T09:05:00Z
status: gaps_found
score: 6/8 must-haves verified
gaps:
  - truth: "The measurement-drift spike fixed the safety margin actually applied by the shipped height-estimation formula."
    status: partial
    reason: "The spike-derived constant (SAFETY_MARGIN_LINES = 1, ~11pt) is applied, but it is dwarfed by PDF_RENDER_SAFETY_MARGIN_PT = 100 — an empirical constant whose calibration sweep was NOT committed, and which demonstrably masks at least one identifiable, fixable height-formula bug. The 184-05 SUMMARY asserts the residual drift is 'not a single identifiable formula bug'; that assertion is falsified below."
    artifacts:
      - path: "lib/pdf/measure-header-height.ts"
        issue: "measureHeaderHeightPt() charges formatAddress() as ONE line (line 96), but formatAddress() joins street and city/state/zip with '\\n' (lib/estimate/document/format.ts:30) and both render inside ONE <Text> in pdf-header.tsx:138. Verified against real PDF bytes: Classic returns 94.78pt vs a real 108.28pt (observed content top y=148.3 = 40pt topPadding + 108.28); Modern returns 105.75pt vs a real ~120.1pt. Under-measured by exactly one prose line (13.5pt Classic / 14.4pt Modern) for any company with a street address AND a city/state/zip — i.e. essentially every real US service business."
      - path: "lib/pdf/measure-header-height.ts"
        issue: "PDF_RENDER_SAFETY_MARGIN_PT = 100 is over-reserved roughly 2-3x. Measured on the committed UAT PDFs, real per-page content overshoot vs the engine estimate is ~25pt + the ~13.5pt header bug = ~39pt on a dense Classic page, against a 111pt reserve. The surplus materialises as 110-135pt (1.5-1.9in) of dead space at the BOTTOM OF EVERY non-final page (Classic p1-p5: 116.5/111.9/111.9/135.4/114.5pt unused; Modern p1-p6: 109.3/186.6/113.0/110.6/133.6/113.0pt unused)."
      - path: "scripts/"
        issue: "No committed diagnostic for the +100pt calibration. 184-01's spike IS committed (scripts/pagination-drift-spike.ts); 184-05's 1..60-item sweep is explicitly 'not committed', so the constant is not independently reproducible or re-derivable when the templates change."
    missing:
      - "Fix measureHeaderHeightPt to charge formatAddress(company).split('\\n').length prose lines instead of 1, with a unit test pinning the 2-line case."
      - "Commit the engine-vs-real-PDF page-count calibration sweep as a repeatable script (mirroring scripts/pagination-drift-spike.ts), then re-derive PDF_RENDER_SAFETY_MARGIN_PT after the header fix — the current 100pt is likely reducible to ~40-60pt, recovering 1-2 item rows per page."
  - truth: "The pagination module is the one function BOTH the PDF renderer and the web measurement provider call (PGBRK-01 / PGBRK-04 as written in REQUIREMENTS.md)."
    status: partial
    reason: "Only the PDF half exists. The MeasurementProvider interface and the client-safety boundary are in place, but there is no DOM provider and no web consumer — grep for imports of lib/estimate/pagination/* outside the module returns only components/pdf/*, lib/pdf/*, and tests. The web paginated preview lands in Phase 185, which ROADMAP Phase 184's goal text explicitly acknowledges."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "PGBRK-01 ('single source of truth consumed by BOTH the web paginated preview and the PDF renderer') and PGBRK-04 ('and the paginated web preview shows the same content on the same pages') are both marked Complete at lines 37/40 and in the coverage table at lines 84/87, though each requirement's own text has an undelivered web-preview clause."
    missing:
      - "Either re-mark PGBRK-01 and PGBRK-04 as Partial with an explicit 'web half -> Phase 185' note, or split the web clause out into its own Phase 185 requirement id — so the ledger stops claiming a surface that does not exist."
human_verification:
  - test: "Open uat/classic-multipage.pdf and uat/modern-multipage.pdf and judge whether ~1.5-1.9in of blank space at the bottom of every page is acceptable customer-facing output."
    expected: "Owner accepts the trade-off, or asks for the safety margin to be re-derived (see gap 1) before Phase 185 mirrors the same budget in the web preview."
    why_human: "Aesthetic/product judgement. The breaks are structurally correct and the page counts are provably right; the question is whether the systematic under-fill is acceptable for a professional estimate."
  - test: "Generate one estimate that carries a signature AND all 5 terms cards AND photos, long enough to span 3+ pages, and check that no signature block, terms card, or photo row is split."
    expected: "Each stays whole on one page; photo grid breaks only between rows."
    why_human: "None of the 4 committed UAT PDFs carry a signature, terms text, or photos — those kinds are covered only by structural unit tests, never by a real rendered multi-page PDF. 184-HUMAN-UAT.md itself flags this as N/A for its own artifacts."
  - test: "Sign off 184-HUMAN-UAT.md (flip status: partial -> verified)."
    expected: "Checklist boxes ticked or issues recorded."
    why_human: "The checklist is durable and accurate but every box is still unchecked; this verifier ticked the structurally-checkable ones (see report) but the file is the owner's record."
---

# Phase 184: Consolidated Pagination Engine Verification Report

**Phase Goal:** ONE deterministic pagination module computes per-page block assignments consumed by the react-pdf renderer via explicit N-`<Page>` composition; locked break rules enforced; repeated continuation table headers; Page N of M; measurement-drift spike fixed the safety margin. Phase 185 will consume the provider interface.
**Verified:** 2026-07-28
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | A line-item row never splits; a section header keeps with its first row; a section subtotal keeps with its last row | ✓ VERIFIED | `buildChains()` (engine.ts:21-37) builds MAXIMAL chains in one linear scan, correctly extending header→row→subtotal for the 1-item case. Confirmed in real PDF bytes: across 13 rendered pages, every 3-line item row is whole; Classic p2 "Framing" hdr y=445.9 + row 11 y=497.1 same page; p3 "Electrical" y=536.2 + row 21 y=587.4; subtotals always trail their last row (p2 row10→sub, p3 row20→sub, p4 row30→sub, p6 row40→sub). Zero orphaned headers or subtotals. |
| 2 | Totals, signature, and each terms card render fully on one page | ✓ VERIFIED | `wrap={false}` present on pdf-totals-block.tsx:99 and :140 (both branches), pdf-signature-block.tsx:38, pdf-terms-section.tsx:66 (per-card). Blocks are `atomic: true` in blocks-from-model.ts. Covered by estimate-pdf-terms-atomicity / -totals / -signature tests. Not exercised by a real multi-page PDF (see human verification). |
| 3 | Every page after page 1 repeats the items-table column header; every page shows Page N of M | ✓ VERIFIED | Real PDF positional dump: Classic continuation headers at page-top y=154.3 on p2/p3/p4/p6; p5 correctly has NO page-top header because its first block is a section-header (`continuesTable` is false by definition), which renders its own header at y=199.6. Modern mirrors this exactly (page-top header y=180.1 on p2/p4/p5/p7; section-header-first on p3/p6). Footers read "Page 1..6 of 6" and "Page 1..7 of 7", sequential and correct, via PdfFooter's react-pdf `render={({pageNumber, totalPages})}` callback. |
| 4 | The PDF renders explicit N `<Page>` elements from the module's output, never emergent Yoga wrap | ✓ VERIFIED | `pages: PageAssignment[]` is a REQUIRED prop (estimate-pdf.tsx:153, -modern.tsx:155) — no optional fallback to the old single-`<Page>` path. `pages.map(...)` at :630 / :648. All 11 block kinds dispatch through ONE `renderBlockForKind` switch, each returning `key={block.id}`. Fixed header/footer chrome preserved per page. |
| 5 | Same block inputs always produce the same page/block assignment (deterministic, byte-stable) | ✓ VERIFIED | `computePageBreaks` is a pure function of its 3 args; zero `Date.now`/`Math.random`/`new Date()` in `lib/estimate/pagination/` (grep clean; only a doc-comment mention). Determinism asserted in engine.test.ts:40 and estimate-pdf-pagination.test.tsx:230. Block ids are stable strings (blocks-from-model.test.ts:343). |
| 6 | The REAL generated PDF byte stream has exactly as many `/Type /Page` objects as the engine's computed count | ✓ VERIFIED | estimate-pdf-pagination.test.tsx:190 (multi-page) and :210 (single-page), both under `describe.each` over Classic AND Modern — 4 real `renderToBuffer` assertions total. All pass. |
| 7 | The measurement-drift spike fixed the safety margin applied in the shipped formula | ⚠️ PARTIAL | `SAFETY_MARGIN_LINES = 1` is genuinely spike-derived, documented in 184-DRIFT-REPORT.md with stated per-page semantics, and IS applied. But the shipped reserve is ~111pt, of which 100pt is `PDF_RENDER_SAFETY_MARGIN_PT` — an uncommitted-sweep empirical constant that masks a confirmed header-measurement bug. See Gaps. |
| 8 | The module is the ONE function both the PDF renderer and the web measurement provider call | ⚠️ PARTIAL | PDF half fully wired (render-estimate-pdf.ts:242). `MeasurementProvider` interface defined and framework-agnostic; client-safety boundary enforced by test. But no DOM provider and no web consumer exists — Phase 185. ROADMAP's goal text explicitly defers this; REQUIREMENTS.md does not. |

**Score:** 6/8 truths verified (2 partial, 0 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `lib/estimate/pagination/engine.ts` | `computePageBreaks`, maximal chains, persistent reservation, per-page margin | ✓ VERIFIED | 133 lines. Maximal chains :21-37; page1Only charged to page-0 budget :86-91; per-page (not per-block) margin :62 with an explicit "no margin term here" comment on `blockHeightPt` :39-48; reservation persisted into `heightUsed` :121-123 with the blocker-2 rationale inline. Empty-page safety valve prevents infinite loop. |
| `lib/estimate/pagination/types.ts` | 11-kind taxonomy, PageBlock, PageBlockRef, PageConstraints, PageAssignment | ✓ VERIFIED | Zero imports. `PageBlockRef` carries sectionId/itemId/itemIndex/termsKey/photoRange — enough for the renderer to resolve every kind without id-string parsing. |
| `lib/estimate/pagination/rules.ts` | Pure predicates, no measurement | ✓ VERIFIED | 14 lines, `isAtomic` + `isPage1Only`, type-only import. |
| `lib/estimate/pagination/measure/safety-margin.ts` | Spike-derived constant citing the report | ✓ VERIFIED | `SAFETY_MARGIN_LINES = 1`, zero imports, cites 184-DRIFT-REPORT.md and states per-page application semantics. |
| `lib/estimate/pagination/measure/estimator.ts` | Server-only fontkit+linebreak provider | ✓ VERIFIED | `import 'server-only'`, module-scope font cache, `FONT_FAMILY_TO_PATH` mirrors register-fonts.ts's 4 families, `'layout' in opened` narrowing guard. |
| `lib/estimate/pagination/blocks-from-model.ts` | Model → PageBlock[], ref populated, token-sourced, client-safe | ✓ VERIFIED | Reads `ESTIMATE_PAGE_GEOMETRY`/`LINE_HEIGHT`/`photosPerRow`/`visibleSectionItems` from `lib/estimate/document/`; zero `components/pdf` import; all remaining literals hand-cited to a named StyleSheet key via `buildTemplateLiterals`. `TERMS_ORDER` pins estimate→payment→timeline→warranty→notes. Visibility gates applied for sections/summary/photos/each terms field. |
| `lib/estimate/document/tokens.ts` | LINE_HEIGHT + ESTIMATE_PAGE_GEOMETRY + photosPerRow | ✓ VERIFIED | `LINE_HEIGHT` Inter 1.21 / Lora 1.28 with the `(ascent - descent + lineGap)/unitsPerEm` derivation cited to @react-pdf/pdfkit's own source line range. `photosPerRow` relocated here out of components/pdf per plan-checker blocker 1. |
| `lib/estimate/document/visible-items.ts` | ONE canonical empty-description filter | ✓ VERIFIED | Single implementation; consumed by blocks-from-model.ts AND both templates' `buildItemRowGroups`. No third re-implementation found. |
| `lib/pdf/measure-header-height.ts` | Per-render data-dependent header height | ⚠️ HOLLOW | Exists, is data-dependent, uses the corrected `max(left, right)` formula — but under-measures multi-line addresses by one prose line. See Gaps. |
| `lib/pdf/render-estimate-pdf.ts` | Invokes pagination before createElement | ✓ VERIFIED | blocksFromModel → computePageBreaks at :222-242, after photo/preparedBy resolution, before createElement; `pages` threaded into both templates. |
| `components/pdf/estimate-pdf.tsx` / `-modern.tsx` | N-Page composition, one keyed dispatcher | ✓ VERIFIED | See truth 4. Explicit 5-key `buildTermsCardMap` (all 5 titles/texts, no broken `L[key]` lookup). |
| `components/pdf/shared/pdf-section-block.tsx` | 4 independent pieces | ✓ VERIFIED | PdfSectionHeader / PdfTableHeaderOnly / PdfSectionRows / PdfSectionSubtotal all exported and called independently. |
| `tests/unit/pdf/_pages-for-fixture.ts` | ONE shared real-pipeline helper | ✓ VERIFIED | Mirrors the resolver's derivation line-for-line, including PDF_RENDER_SAFETY_MARGIN_PT — no drift between test and production constraint construction. |
| `tests/unit/pdf/estimate-pdf-pagination.test.tsx` | Real byte page-count assertion | ✓ VERIFIED | See truth 6. |
| `.planning/.../184-DRIFT-REPORT.md` | Verbatim spike output + go/no-go + semantics | ✓ VERIFIED | GO decision, 4/5 samples zero drift, explicit "Margin Application Semantics" section. |
| `.planning/.../uat/*.pdf` (4) + `184-HUMAN-UAT.md` | UAT artifacts | ✓ VERIFIED | All 4 PDFs present and are real renderToBuffer output (14-37KB). Checklist durable, honest ("does NOT assert that a human has verified it"), all boxes unchecked. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| render-estimate-pdf.ts | engine.ts | `computePageBreaks(blocksFromModel(...), constraints, createFontkitMeasurementProvider())` | ✓ WIRED | :242 |
| estimate-pdf.tsx | `pages` prop | `pages.map` + `renderBlockForKind` keyed by `block.id` | ✓ WIRED | Required prop, no fallback |
| estimate-pdf.tsx | pdf-terms-section.tsx | explicit 5-key termsKey map | ✓ WIRED | `buildTermsCardMap` :55-68 |
| estimate-pdf.tsx | PdfTableHeaderOnly | after section header + once at page top iff `continuesTable` | ✓ WIRED | :491 and :660; mutual exclusivity is structural (a page starting with a section-header can never have `continuesTable`) — confirmed in the real PDFs |
| engine.ts | rules.ts | keepWithNextId/keepWithPreviousId chain building | ✓ WIRED | :28 |
| engine.ts | safetyMarginPt | flat per-page reserve, not per-block | ✓ WIRED | :62 only |
| blocks-from-model.ts | visible-items.ts | imports `visibleSectionItems` | ✓ WIRED | :34, :340 |
| blocks-from-model.ts | tokens.ts | photosPerRow / ESTIMATE_PAGE_GEOMETRY / LINE_HEIGHT | ✓ WIRED | :28-33 |
| estimator.ts | register-fonts.ts | same 4 family names → same vendored TTFs | ✓ WIRED | FONT_FAMILY_TO_PATH |
| package.json | fontkit / linebreak | direct deps, not transitive-only | ✓ WIRED | :54, :57 |
| pagination core | client bundles | zero react-pdf/react/components/fontkit/linebreak imports | ✓ WIRED | pagination-engine-boundary.test.ts covers 5 core files; estimator excluded by design and guarded with `import 'server-only'` |
| **pagination module** | **web measurement provider** | **DOM provider** | **✗ NOT_WIRED** | **Does not exist — Phase 185. Grep for pagination imports outside the module returns only components/pdf/*, lib/pdf/*, tests.** |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| estimate-pdf.tsx | `pages` | render-estimate-pdf.ts's real `computePageBreaks` call | Yes — 6/7 real pages in committed PDF bytes | ✓ FLOWING |
| computePageBreaks | `constraints.contentHeightPt` | `measureHeaderHeightPt(company, templateId)` | Yes, but under-measures by one line for 2-line addresses | ⚠️ STATIC-ISH (real computation, wrong result) |
| computePageBreaks | `constraints.safetyMarginPt` | SAFETY_MARGIN_LINES × lineHeight + PDF_RENDER_SAFETY_MARGIN_PT | Yes, but 100/111pt of it is an uncommitted-sweep literal | ⚠️ see Gaps |
| blockHeightPt | `lineCount` | fontkit `layout()` + linebreak `LineBreaker` over the real vendored TTF | Yes — validated byte-identical to @react-pdf/pdfkit's `heightOfString()` | ✓ FLOWING |
| renderBlockForKind | `block.ref` | blocksFromModel populates every block | Yes — sectionsById/termsCardMap/photoRange lookups all resolve | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| CI typecheck clean | `npx tsc -p tsconfig.ci.json --noEmit` | exit 0, no output | ✓ PASS |
| Pagination + PDF suites green | `npx vitest run tests/unit/pagination tests/unit/pdf` | 20 files, **129 tests, 129 passed**, 7.28s | ✓ PASS |
| Real UAT PDF page counts | `pymupdf` open on all 4 artifacts | classic-1page 1, classic-multipage 6, modern-1page 1, modern-multipage 7 — matches 184-HUMAN-UAT.md exactly | ✓ PASS |
| Page N of M correctness | footer text extraction, all 15 pages | "Page 1 of 1", "Page 1..6 of 6", "Page 1..7 of 7" — sequential, correct M | ✓ PASS |
| Continuation header placement | positional dump of both multipage PDFs | Header at page-top on exactly the pages whose first block is an item-row; absent on section-header-first pages | ✓ PASS |
| Header-height formula vs reality | `npx tsx` on `measureHeaderHeightPt(FIXTURE_COMPANY, ...)` vs observed content top | classic 94.78 vs real 108.28; modern 105.75 vs real ~120.1 | ✗ FAIL (see Gaps) |
| Visual glyph rasterization of UAT PDFs | pymupdf `get_pixmap` | Backgrounds/rules render; glyphs blank — `FT_New_Memory_Face(...Lora-Bold): broken table`. `pdftotext` extracts all text fine, so the PDFs are structurally sound; this is a MuPDF/FreeType limitation with react-pdf's font subsets, not a phase defect. Structural inspection performed positionally instead. | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| PGBRK-01 | 184-02, -03, -05 | ONE deterministic module, single source of truth consumed by BOTH web preview and PDF renderer | ⚠️ PARTIAL (marked Complete) | Module + PDF half fully delivered and tested. Web-preview clause undelivered (Phase 185). |
| PGBRK-02 | 184-02, -04 | Break rules: row never splits, header+first row, subtotal+last row, totals/signature/terms atomic, photo grid breaks between rows | ✓ SATISFIED | engine.test.ts (11 cases incl. the 1-item 3-block chain, atomic overflow, page1Only budget, photo-row independence, per-page margin, persistent reservation); rules.test.ts (5 cases); `wrap={false}` on all 3 atomic components; row-chunked PdfPhotoGrid; confirmed in real PDF bytes |
| PGBRK-03 | 184-05 | Continuation pages repeat the column header; every page shows Page N of M | ✓ SATISFIED | Verified in real PDF bytes on both templates; test asserts exact occurrence counts (1 + section-headers-on-that-page) |
| PGBRK-04 | 184-05 | PDF renders explicit `<Page>` from module output; web preview shows same content on same pages | ⚠️ PARTIAL (marked Complete) | PDF half proven by real `/Type /Page` byte count. Web-preview clause undelivered (Phase 185). |
| PGBRK-05 | 184-01, -03 | Same registered TTF family, fontkit+linebreak provider, drift spike fixes the safety margin | ⚠️ PARTIAL (marked Complete) | Spike ran, documented, GO; SAFETY_MARGIN_LINES derived and applied; fontkit/linebreak promoted to direct deps; hand-calculated arithmetic test against the real Inter TTF. But the effective shipped margin is 90% an unrelated, uncommitted-sweep constant masking a real formula bug. |

No ORPHANED requirements — REQUIREMENTS.md maps exactly PGBRK-01..05 to Phase 184, and all five appear in plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `lib/pdf/measure-header-height.ts` | 96 | Single-line assumption over a `\n`-joined string | 🛑 Blocker (for margin correctness, not for shipping) | Over-states usable content height by 13.5-14.4pt on every page for essentially every real company |
| `lib/pdf/measure-header-height.ts` | 155 | Empirical constant with an uncommitted derivation | ⚠️ Warning | Not reproducible; will silently rot the moment either template's StyleSheet changes |
| `components/pdf/estimate-pdf.tsx` / `-modern.tsx` | 80-110 | `buildItemRowGroups` duplicated near-verbatim in both templates | ℹ️ Info | Only the styles differ at the call site; the grouping logic itself is identical and could live in `shared/`. Not a goal risk. |
| `scripts/pagination-drift-spike.ts` | 29, 78, 86 | 3 pre-existing TS errors under bare `tsc` | ℹ️ Info | Already logged honestly in `deferred-items.md`; outside `tsconfig.ci.json`'s scope so CI is unaffected |
| `tests/.../document-fixtures.ts` (via UAT) | — | classic-1page shows Subtotal $1,500 / Total $1,461.38 against a single $750 line item | ℹ️ Info | Fixture override artifact (sections replaced, totals not recomputed). Harmless for pagination, but may confuse a human UAT reviewer. |

No TODO/FIXME/XXX/HACK/PLACEHOLDER in any of the 10 core phase files. No `Date.now`/`Math.random` in the pagination module.

### Human Verification Required

See `human_verification` in the frontmatter. Summary:

1. **Judge the bottom dead-space.** Every non-final page ends 110-135pt (Classic) / 110-187pt (Modern) above the content limit. Structurally correct, aesthetically debatable — and Phase 185 will mirror whatever budget is decided here.
2. **Render a signature + 5-terms + photos multi-page estimate.** None of the 4 UAT PDFs carry any of those kinds; their atomicity is unit-tested but never seen in a real multi-page render. `184-HUMAN-UAT.md` marks these N/A for its own artifacts.
3. **Sign off `184-HUMAN-UAT.md`** (status: partial → verified).

Items 1, 2, 3, 4, 7, 8 of that checklist were verified structurally by this report against the real PDF bytes and can be considered discharged; items 5, 6, 9, 10 need the runs above.

### Gaps Summary

The phase's headline claim holds up. There is genuinely ONE deterministic module; it genuinely drives explicit `<Page>` composition through one keyed dispatcher in both templates; the locked break rules genuinely hold in real rendered PDF bytes (I inspected all 13 multi-page pages positionally — zero orphaned headers, zero orphaned subtotals, zero split rows); continuation headers appear on exactly the right pages with exactly the right semantics; Page N of M is correct. The real-byte `/Type /Page` assertion is the right test and it passes for both templates on both single- and multi-page fixtures. 129 tests green, CI typecheck clean.

Two things are not what the SUMMARY says they are.

**First, the safety margin.** The phase goal says the drift spike "fixed the safety margin". The spike-derived value is 1 line (~11pt). What actually ships is ~111pt, because 184-05 bolted on `PDF_RENDER_SAFETY_MARGIN_PT = 100`. Its doc comment argues the residual drift is a diffuse, cumulative Yoga-vs-additive-model effect and "not a single identifiable formula bug". That is not accurate: `measureHeaderHeightPt` charges `formatAddress()` as one line, but `formatAddress` joins street and city/state/zip with `\n` and both render in a single `<Text>`. I confirmed the arithmetic against the committed PDFs — predicted content top with 2 address lines is 148.28pt, observed is 148.3pt; with the shipped 1-line formula it would be 134.78pt. Exactly one prose line short, on both templates, for any company with a full US address. That is an identifiable, fixable bug that the 100pt is paying for. And the sweep that calibrated the 100pt was deliberately not committed, unlike 184-01's spike script — so nobody can re-derive it. The visible cost is 1.5-1.9 inches of dead space at the bottom of every page and roughly 15-20% more pages than necessary in every multi-page estimate.

**Second, the requirements ledger.** PGBRK-01 and PGBRK-04 are both marked Complete, but each contains an explicit web-paginated-preview clause that Phase 185 delivers. The ROADMAP goal is honest about this ("and, in Phase 185, the web paginated preview"); REQUIREMENTS.md is not. The engineering decision to defer is correct and the interface/boundary work to enable it is real and tested — the ledger just shouldn't say "Complete" for a surface that has no consumer.

Neither gap blocks the phase from functioning or Phase 185 from starting. Both should be closed before Phase 185 hardens the same numbers into the web preview, because 185's entire premise is mirroring the PDF's page budget — mirroring a budget that is 70pt too conservative and 13.5pt wrong at the header would bake the error into both surfaces.

---

_Verified: 2026-07-28_
_Verifier: Claude (gsd-verifier)_
