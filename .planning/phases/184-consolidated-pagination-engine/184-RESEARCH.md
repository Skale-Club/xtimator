# Phase 184: Consolidated Pagination Engine - Research

**Researched:** 2026-07-28
**Domain:** Deterministic cross-renderer pagination (pure-TS rule engine + fontkit/linebreak measurement estimator) consumed by `@react-pdf/renderer` now, and the web paginated preview in Phase 185
**Confidence:** MEDIUM-HIGH — block inventory, page geometry, and stack versions are HIGH (read directly from the live post-183 codebase + `node_modules` + npm registry). The measurement-drift number itself (browser DOM vs. fontkit) is LOW until the mandated spike runs — this file designs that spike, it does not pre-empt its result.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**The consolidated rule (PGBRK-01/02)**
- Module lives at `lib/estimate/pagination/` — pure TS, server+client safe (no react-pdf, no DOM imports in the core).
- Contract: (document model blocks + measurement provider + page geometry from `lib/estimate/document`) → ordered pages of block assignments. Deterministic: same input → same pages, byte-stable.
- Break rules (locked): line-item row never splits; section header keeps with ≥1 first row; section subtotal keeps with the last row; totals block atomic; signature block atomic; each terms card atomic; photo grid breaks only between rows; no manual page breaks.
- Explicit precomputed breaks — the PDF renders one `<Page>` per computed page (PGBRK-04); NEVER rely on emergent Yoga `wrap` for break decisions. `fixed` header/footer elements may remain for repeated chrome.

**Continuation chrome (PGBRK-03)**
- Continuation pages repeat the items-table column header (hand-built from per-page item ranges — react-pdf has no thead-repeat).
- Every page: "Page N of M" (footer already exists in PDF via render callback — now driven by the module's page count).

**Measurement strategy (PGBRK-05)**
- SPIKE FIRST (research-mandated, LOW-confidence area): quantify browser-DOM vs fontkit text measurement drift for representative estimate text with the SAME TTF font; pick the safety margin from measured data. Spike output is a short doc + the margin constant.
- Font: register the same TTF family the web renders (Font.register; TTF not WOFF2). Both PDF templates move to it — coordinate with what Phase 183 shipped (if 183 already registered fonts, reuse; do not have two font sources).
- Measurement provider interface with two implementations: (a) estimator (fontkit + linebreak — react-pdf's own transitive deps, promote to direct deps) used server-side for the PDF path; (b) DOM measurement (Phase 185 wires it; interface defined here).
- Fidelity bar (locked): same page-break decisions + same content per page — NOT pixel parity.

**PDF wiring (PGBRK-04)**
- Both PDF templates consume the module's output: map pages → explicit `<Page>` elements, items sliced per page ranges, repeated table headers on continuations.
- The shared resolver (`lib/pdf/render-estimate-pdf.ts`) invokes pagination before rendering.
- Regression guard: existing PDF tests stay green; add structural tests (e.g., N-item estimate → expected page count + expected block assignment snapshot).

### Claude's Discretion
- Internal module layout (rules.ts / engine.ts / measure/*.ts / types.ts).
- Exact estimator implementation details (line-break iteration, per-block measurers) as long as deterministic + tested.
- Whether page-count metadata gets exposed to the ETag/contentKey of the PDF route.

### Deferred Ideas (OUT OF SCOPE)
- The editable paginated web view (DOM measurement provider wiring, toggle UI) → Phase 185.
- Webview aesthetics → Phase 186.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| PGBRK-01 | One deterministic pagination module (`lib/estimate/pagination/`) computes per-page block assignments; single source of truth for web + PDF | Architecture Patterns section proposes the exact file layout and `PageBlock`/`computePageBreaks()` contract, grounded in the live block taxonomy below. Greenfield confirmed — `lib/estimate/pagination/` does not exist yet (`Glob` returned no files). |
| PGBRK-02 | Break rules: row never splits; header keeps with first row; subtotal keeps with last row; totals/signature/terms-card atomic; photo grid breaks only between rows | "Block Inventory" + "Current Atomicity vs. Locked Rules — Gaps" tables enumerate exactly which shared components already honor these rules (`PdfSignatureBlock`'s `wrap={false}`) and which do NOT yet (photo grid is currently ALL-atomic via `wrap={false}` on the whole grid, contradicting "breaks only between rows"; terms cards share one un-atomic `View` with no per-card `wrap={false}`). |
| PGBRK-03 | Continuation pages repeat the items-table column header; every page shows "Page N of M" | `PdfFooter` already implements "Page N of M" via `render={({pageNumber,totalPages}) => ...}` (react-pdf's built-in per-page counters — this stays correct automatically once N `<Page>` elements exist). The repeated table header does NOT exist as a standalone component yet — `PdfSectionBlock` bundles header+table-header+rows+subtotal as one unit; Code Examples section sketches the split. |
| PGBRK-04 | PDF renders explicit `<Page>` elements from the module's output; paginated web preview shows the same content on the same pages | "PDF Wiring" section traces the exact current single-`<Page>` composition in `estimate-pdf.tsx`/`estimate-pdf-modern.tsx` and `lib/pdf/render-estimate-pdf.ts`'s `createElement` call site, and sketches the N-`<Page>` restructure + the baseline-order test's incompatibility with it (a real gap to close in planning). |
| PGBRK-05 | Same registered font family (TTF) with a fontkit+linebreak measurement provider; a spike validates the approach and fixes the safety margin | "fontkit + linebreak: Confirmed API Shape" section verifies exact installed versions and the real `layout()`/`LineBreaker` API (read from `@react-pdf/pdfkit`'s own source, not assumed). "Spike Design" section gives a concrete, executable spike using the installed Playwright Chromium binary. |
</phase_requirements>

## Summary

Post-Phase-183, both PDF templates (`components/pdf/estimate-pdf.tsx`, 519 lines; `components/pdf/estimate-pdf-modern.tsx`, 536 lines) are thin compositions of 9 shared `components/pdf/shared/*` components, each invoked as a **plain function call** (not JSX) inside a single `<Document><Page size="LETTER" wrap>...</Page></Document>` tree. There is currently **zero** pagination logic anywhere in the repo — `lib/estimate/pagination/` does not exist, and the only page-break behavior today is react-pdf's own emergent Yoga `wrap` (the default `wrap` prop, true unless explicitly set), which is exactly the mechanism CONTEXT.md's locked decisions and PITFALLS.md's Pitfall 1/10 say NOT to rely on. `fontkit@2.0.4` and `linebreak@1.1.0` are already installed as transitive dependencies of `@react-pdf/pdfkit@5.0.0` (confirmed in `node_modules`, and confirmed as the exact APIs `@react-pdf/pdfkit`'s own `pdfkit.js` uses internally for text layout: `fontkit.openSync(src, family)`, `font.layout(text, features, ..., 'ltr')` → `run.advanceWidth`/`run.glyphs[i].advanceWidth`, and `new LineBreaker(text)` with a `.nextBreak()` iterator for UAX#14 break opportunities). Both TTF font families (Inter, Lora) are already vendored at `public/fonts/{inter,lora}/*.ttf` and registered once at module scope in `lib/pdf/register-fonts.ts` — Phase 183 already did the font work this phase's locked decision asks to reuse, not duplicate.

The real work of this phase is threefold: (1) build the pure rule engine (`computePageBreaks`) and its fontkit/linebreak-backed server-side measurement provider against the concrete block taxonomy and font-size/padding numbers extracted below from the live StyleSheets; (2) restructure both PDF templates from one `<Page wrap>` to N explicit `<Page>` elements driven by the engine's per-page block/item-range output, which requires splitting `PdfSectionBlock` (currently one atomic function producing header+table-header+all-rows+subtotal) into a repeatable table-header primitive plus per-page item slices, and fixing two components that currently violate the locked break rules (the photo grid is entirely `wrap={false}`-atomic today, but the locked rule requires it to break only between visual rows; the terms block bundles all terms cards in one non-atomic `View` with no per-card `wrap={false}`); and (3) run the mandated measurement-drift spike (browser DOM vs. `fontkit`) before finalizing the estimator's safety margin, since this is the one area where training-data confidence is explicitly LOW per the milestone's own STACK.md.

**Primary recommendation:** Build `computePageBreaks(blocks, constraints, measurementProvider)` as a pure function operating on a `PageBlock[]` derived from `DocumentSection[]`/`DocumentSignature`/photos/terms (already-shared types in `lib/estimate/document/model.ts`), with the server-side `measure/estimator.ts` using `fontkit.openSync()` + a greedy UAX#14 line-packer built on `linebreak`'s `LineBreaker` for the one field that actually wraps (item `description`, `colDescription` ≈ 40% of content width) — then wire both PDF templates to render N explicit `<Page>` elements from the engine's output, replacing `PdfSectionBlock`'s single atomic-`View`-with-`wrap` design with a split header/rows/subtotal contract the engine can slice across pages.

## Standard Stack

### Core (already installed, versions verified against the live tree and npm registry — 2026-07-28)

| Library | Installed | Latest (npm view) | Purpose | Why Standard |
|---------|-----------|--------------------|---------|--------------|
| `@react-pdf/renderer` | `4.4.0` (`package.json` `^4.4.0`) | `4.5.1` | PDF renderer, unchanged role | Routine patch bump — `npm view @react-pdf/renderer version` confirms `4.5.1` is current; no pagination-API breaking changes are indicated. Not a required change for this phase, but a cheap, low-risk one to bundle. |
| `fontkit` | `2.0.4` (transitive, confirmed present in `node_modules/fontkit/package.json`) | `2.0.4` (already latest) | Node-side glyph/advance-width measurement | Already the literal library `@react-pdf/pdfkit@5.0.0` uses internally (confirmed via reading `node_modules/@react-pdf/pdfkit/lib/pdfkit.js:37618` — `font = fontkit.openSync(src, family)` — and its `layoutRun`/`widthOfString` methods at lines 37417-37499). Depending on it directly means the estimator measures with the exact code react-pdf itself renders with. |
| `linebreak` | `1.1.0` (transitive, confirmed present) | `1.1.0` (already latest) | UAX#14 Unicode line-break opportunity iterator | Also already a `@react-pdf/pdfkit` dependency — confirmed at `pdfkit.js:37838`: `const breaker = new LineBreaker(text)` then `breaker.nextBreak()` in a loop (`eachWord`). This is the exact greedy-wrap algorithm react-pdf's own text layout uses. |
| `@types/fontkit` | not installed | `2.0.9` | TypeScript types for `fontkit` | `fontkit`'s own `package.json` has no `types`/`exports` entry for a `.d.ts` (confirmed: `dist/` contains only `.cjs`/`.mjs` + sourcemaps, no `.d.ts`) — must add `@types/fontkit` as a dev dependency for a typed estimator module. |

**Neither `fontkit` nor `linebreak` currently appears in `package.json`'s `dependencies`** (confirmed via direct read — both resolve today only because they're nested under `@react-pdf/pdfkit`'s own `node_modules` resolution). Promoting them to direct dependencies is required before importing them from `lib/estimate/pagination/measure/estimator.ts` — do not rely on transitive resolution for a first-class module import.

### Installation

```bash
npm install fontkit@^2.0.4 linebreak@^1.1.0
npm install -D @types/fontkit@^2.0.9
# Optional, low-risk, not required by this phase:
npm install @react-pdf/renderer@^4.5.1
```

### What NOT to add

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `opentype.js` or any second TTF parser | A different implementation from what `@react-pdf/pdfkit` actually renders with — introduces a divergence risk between "what the engine predicted" and "what react-pdf actually drew," which is exactly the failure mode this phase exists to eliminate | `fontkit` (already react-pdf's own dependency) |
| `@react-pdf/textkit` as a direct import | Internal, undocumented react-pdf monorepo package (`layoutEngine`, `bidi`, `scriptItemizer` — no stable public contract), versioned in lockstep with the rest of react-pdf; a routine react-pdf upgrade could silently change/remove it | `fontkit` + `linebreak` directly — the lower-level, independently-versioned primitives textkit itself is built on |
| `minPresenceAhead`, relying on `wrap`/`break` combinatorics as the primary break mechanism | Zero current usage confirmed (`grep -r "minPresenceAhead\|wrap={false}\|break={" components/` found only the 2 existing `wrap={false}` atomic blocks — signature, photos); has open upstream bugs when combined with `fixed` ([react-pdf#2238](https://github.com/diegomura/react-pdf/issues/2238), [#2659](https://github.com/diegomura/react-pdf/issues/2659)) | The engine's explicit per-page block assignment; react-pdf's own `wrap={false}` stays only as a redundant per-atomic-block safety net |
| `paged.js` / any CSS-Paged-Media polyfill | Computes its OWN breaks from live DOM measurement — reintroduces exactly the "two engines independently guessing" problem this phase is designed to eliminate; also DOM-mutating, fights live editing (Phase 185's requirement) | The shared engine, told where to cut by `computePageBreaks()`, not deciding independently |
| A canvas/native text-shaping binding for server-side measurement | Fragile to build inside the Alpine Docker image (`node:24-alpine`, no puppeteer/Chromium precedent per CLAUDE.md/PROJECT.md) | `fontkit` (pure JS/WASM-free, already proven to work in this container since react-pdf itself depends on it) |

## Architecture Patterns

### Block Inventory (from the live post-183 code, exact file:line)

Both templates compose the SAME 9 shared components in the SAME order (`components/pdf/estimate-pdf.tsx:345-518`, `components/pdf/estimate-pdf-modern.tsx:360-535`):

| Order | Block | Component | Current atomicity | File:line |
|-------|-------|-----------|--------------------|-----------|
| 1 | Company header (logo, name, contact, address, lang badge) | `PdfHeader` | `fixed` (repeats every page — in-flow, height is DATA-DEPENDENT, see below) | `estimate-pdf.tsx:350-366`; component at `components/pdf/shared/pdf-header.tsx:69-76` |
| 2 | "ESTIMATE" title banner | `PdfTitleBanner` | Page-1-only today (renders once, not `fixed`) | `estimate-pdf.tsx:370-377`; `pdf-title-banner.tsx:44-68` |
| 3 | Project / Bill To info grid | `PdfInfoGrid` | Page-1-only today | `estimate-pdf.tsx:381-396`; `pdf-info-grid.tsx:68-125` |
| 4 | Summary text (optional) | inline `<View>`/`<Text>` (not extracted) | Page-1-only today, no `wrap={false}` | `estimate-pdf.tsx:398-404` |
| 5 | Sections: header + table header + item rows (zebra) + subtotal | `PdfSectionBlock` (one call per section, `.map()`) | **ONE atomic `View` with `wrap` (true, default)** wrapping header+table-header+ALL rows+subtotal — no internal split points today | `estimate-pdf.tsx:409-441`; `pdf-section-block.tsx:59-122` |
| 6 | Totals (Subtotal→Discount→Tax→Total→Deposit→Balance Due) | `PdfTotalsBlock` (variant `classic`/`modern`) | No explicit `wrap={false}` on the outer container today — relies on default Yoga wrap, NOT yet atomic | `estimate-pdf.tsx:445-462`; `pdf-totals-block.tsx:92-171` |
| 7 | Terms (Estimate Terms / Payment / Timeline / Warranty / Notes — up to 5 conditional cards) | `PdfTermsSection` | **ALL 5 cards share ONE `<View style={termsSection}>` with NO `wrap={false}` anywhere** — not atomic per-card today | `estimate-pdf.tsx:469-480`; `pdf-terms-section.tsx:66-101` |
| 8 | Signature (signer name, date, PNG image) | `PdfSignatureBlock` | **`wrap={false}` — already atomic**, gated `if (!signature) return null` | `estimate-pdf.tsx:487-492`; `pdf-signature-block.tsx:37-48` |
| 9 | Photo grid (flex-wrap row of photo+caption) | `PdfPhotoGrid` | **`wrap={false}` on the WHOLE grid — the entire grid is one atomic block today**, which is STRICTER than the locked rule (locked rule: breaks only between visual rows, i.e., a partially-full grid should be allowed to split between rows, never mid-row) | `estimate-pdf.tsx:497-503`; `pdf-photo-grid.tsx:40-56` |
| 10 | Prepared by (optional) | inline `<View>`/`<Text>` | Page-1-only today, no atomicity concern (single short block) | `estimate-pdf.tsx:505-511` |
| 11 | Footer "Page N of M" | `PdfFooter` | `fixed` + react-pdf's own `render={({pageNumber,totalPages}) => ...}` callback — **this already works correctly for N pages with zero change**, since react-pdf computes `pageNumber`/`totalPages` from the actual rendered `<Page>` count | `estimate-pdf.tsx:515`; `pdf-footer.tsx:22-32` |

This ordered list IS the pagination engine's block taxonomy — `PageBlock.kind` should be one of `'header' | 'title-banner' | 'info-grid' | 'summary' | 'section-header' | 'item-row' | 'section-subtotal' | 'totals' | 'terms-card' | 'signature' | 'photo-row' | 'prepared-by'`. Note items 1-4 and 10 are currently **page-1-composition concerns** (header repeats via `fixed`; title/info-grid/summary/prepared-by render once) — the engine's contract must distinguish "blocks that flow and can span pages" (sections' rows, totals, terms, signature, photos) from "chrome that's either fixed-every-page (header, footer) or page-1-only-static (title, info grid, summary, prepared-by)."

### Current Atomicity vs. Locked Rules — Gaps to Close in Planning

| Locked rule (CONTEXT.md) | Current code | Gap |
|---|---|---|
| Line-item row never splits | `PdfSectionBlock`'s rows are inside one `View` with default `wrap` — no per-row `wrap={false}` | Add `wrap={false}` per row, OR (better) let the engine decide row placement explicitly and never emit a row split in its output — react-pdf's own `wrap={false}` becomes a redundant safety net, not the primary mechanism (per CONTEXT.md's explicit precomputed-breaks decision) |
| Section header keeps with ≥1 first row | Not encoded anywhere — `PdfSectionBlock` is one atomic tree today (whole section can't split at all under the CURRENT code, ironically over-atomic, but ONLY because it relies on default `wrap` doing nothing predictable — no actual guarantee) | Engine must explicitly check "does header + first row fit in remaining page space?" before assigning; if not, both move to the next page |
| Section subtotal keeps with last row | Same as above | Engine must check "does the last row + subtotal fit together?" |
| Totals block atomic | `PdfTotalsBlock`'s outer `View` has NO `wrap={false}` today | Add `wrap={false}` to `styles.totalsContainer`'s wrapping `View`, or make the engine push it whole to a fresh page (never let react-pdf split it) |
| Signature block atomic | **Already `wrap={false}`** (`pdf-signature-block.tsx:38`) — comment literally says "Phase 184's later pagination work depends on this" | None — reuse as-is |
| Each terms card atomic | `PdfTermsSection` wraps ALL 5 cards in ONE `<View style={termsSection}>` with no per-card boundary | Restructure `PdfTermsSection` to render each of its 5 conditional `Fragment`s as its own `wrap={false}` `View`, so the engine can place cards independently across pages |
| Photo grid breaks only between rows | **Current: `wrap={false}` on the ENTIRE grid** — stricter than locked (an unsigned estimate with 9 photos today cannot split at all, even between rows) | Restructure `PdfPhotoGrid` to group photos into row-chunks (`photosPerRow = floor(contentWidth / (150 + gap))`) and mark each ROW `wrap={false}`, not the whole grid |

### Page Geometry (from `lib/estimate/document/tokens.ts` + live StyleSheets)

`lib/estimate/document/tokens.ts:10-15` is the ONE source for `LETTER_WIDTH_PT`/`LETTER_HEIGHT_PT` (612×792pt) and the `PT_PER_PX`/`PX_PER_PT` (72/96) conversion — enforced by a static-grep test (`tests/unit/estimate/pt-px-conversion-source.test.ts`, which will need a new entry for whatever file the pagination engine's page-geometry constants live in, per its `CLEAN_SOURCES` array pattern).

| Template | Page padding (StyleSheet `page`) | Content width | Content height (before header) | Footer position |
|---|---|---|---|---|
| Classic | `paddingTop: 40, paddingBottom: 60, paddingHorizontal: 40` (`estimate-pdf.tsx:87-91`) | 612 − 80 = **532pt** | 792 − 40 − 60 = **692pt** | `position: 'absolute', bottom: 30` (`estimate-pdf.tsx:301-309`) — **out of flow, does not consume content height** beyond the `paddingBottom: 60` reservation already budgeted for it |
| Modern | `paddingTop: 52, paddingBottom: 68, paddingHorizontal: 52` (`estimate-pdf-modern.tsx:90-94`) | 612 − 104 = **508pt** | 792 − 52 − 68 = **672pt** | `position: 'absolute', bottom: 34` (`estimate-pdf-modern.tsx:313-321`) — same, out of flow |

**Critical, load-bearing finding — header height is data-dependent, not a fixed token:** `PdfHeader` (`pdf-header.tsx:69-152`) is `fixed` (in-flow, repeats on every page) but its rendered height varies with which of `company.phone`/`email`/`website`/`address`/`logo_url` are present (conditionally-rendered `Link`s joined by `"  |  "`, an optional address `Text`, an optional 72×72/64×64 logo). This means **the per-render "usable content height per page" is NOT a static constant from `tokens.ts`** — it must be computed once per render from the actual company data before `computePageBreaks()` runs (e.g., count populated contact fields × line-height + conditional logo height, or measure it with the same estimator). Treat this as a `PageConstraints.headerHeight` input the resolver computes per-render, never a hardcoded number in `tokens.ts`.

**Text styles that lack an explicit `lineHeight`:** several block styles used for measurement-critical text (`tableCellText`, `tableHeaderText`, `totalsLabel`/`totalsValue`) set only `fontSize`, no `lineHeight` — relying on react-pdf/Yoga's internal default. This is an open item the estimator cannot silently guess (see Open Questions) — pin an explicit `lineHeight` token for every text style the engine measures against, and verify the assumed value against a real `renderToBuffer` output during the spike, rather than asserting a specific react-pdf default number here.

### Which fields actually wrap (measurement-critical) vs. fixed-content blocks

| Field | Column width | Wraps? |
|---|---|---|
| `item.description` (`colDescription`, 40% of content width) | Classic ≈ 213pt, Modern ≈ 203pt | **YES — the one field most likely to drive row-height variance.** This is the field the estimator's `fontkit`+`linebreak` line-packer exists for. |
| `section.title` | Full width, no explicit column constraint | Rarely wraps in practice (short labels) — treat as single-line by default, but don't hardcode; run through the same wrap estimator for safety |
| `client.name`/address, `company` contact lines | Fixed narrow info-grid column (48% width, `infoBlock`) | Can wrap for long names/addresses — same treatment as description |
| `termsText` (Estimate Terms / Payment / Timeline / Warranty / Notes) | Full content width, `lineHeight` set (1.5 Classic / 1.6 Modern) | Free text, length unbounded — must be wrap-estimated; these are also the fields Phase 183's `PdfTermsSection` doesn't yet make atomic per-card (see gap table above) |
| `estimate.summary` | Full content width | Free text, unbounded — same treatment |
| Numeric cells (qty/unit/unit price/total), section subtotal, totals rows, table headers | Fixed narrow columns, short formatted strings (money via `formatMoney`) | Effectively fixed-height — safe to treat as always single-line (no wrap estimation needed), but not zero-risk for extreme currency/locale strings — flag as a fixture edge case to test, not assumed safe without a test |
| Signature block (image 150×40 fixed + 2 short text lines) | Fixed | Fixed height — no measurement needed, already atomic |
| Photo caption | 150pt-wide photo tile | Can wrap for long captions — needs wrap estimation if the height budget must be precise; low priority since photos are grouped by row already |

### Proposed Module Layout

```
lib/estimate/pagination/
├── types.ts            # PageBlock, PageConstraints, PageAssignment, MeasurementProvider interface
├── rules.ts             # keep-with-next/previous/atomic predicates per block kind (pure, no measurement)
├── engine.ts             # computePageBreaks(blocks, constraints, measure): PageAssignment[] — the ONE deterministic function
├── blocks-from-model.ts  # DocumentSection[]/DocumentSignature/photos/terms → PageBlock[] (structure only, no heights)
└── measure/
    ├── types.ts          # MeasurementProvider interface (shared contract — client AND server implement this)
    └── estimator.ts      # SERVER-ONLY: fontkit + linebreak implementation (imports 'node:fs' via fontkit — cannot ship to the client bundle)
```

This mirrors the existing flat `lib/estimate/*` convention (`compute-totals.ts`, `presentation-settings.ts`, `deposit-display.ts`, `templates/registry.ts` all live directly under `lib/estimate/`) and matches the file layout ARCHITECTURE.md sketched pre-183 (`lib/estimate/pagination/{types,engine,blocks-from-model,measure-dom,measure-pdf}.ts`) — this phase renames `measure-pdf.ts` → `measure/estimator.ts` to make the server-only boundary a directory-level fact, not just a filename convention, and to leave room for `measure/dom.ts` to land in Phase 185 without touching this phase's files.

**Correction to ARCHITECTURE.md (pre-183 research):** that file recommended AVOIDING real font-metric measurement server-side ("avoid pulling in a canvas/text-measurement native dependency... fragile to build on the Alpine container") in favor of a `columnWidth ÷ average-glyph-width` heuristic. **STACK.md (same research date, more specific) and CONTEXT.md's locked decision supersede this** — `fontkit`+`linebreak` are pure-JS/WASM-free (no native binding, no canvas), already proven to run inside this exact `node:24-alpine` container today (react-pdf itself depends on them for every PDF render in production), so the Alpine concern that motivated ARCHITECTURE.md's heuristic-only recommendation does not actually apply to `fontkit`. Follow STACK.md/CONTEXT.md: use real glyph-metric measurement, not a character-count heuristic.

### Server/Client Boundary

`lib/estimate/pagination/engine.ts`, `types.ts`, `rules.ts`, and `blocks-from-model.ts` must have **zero** imports of `fontkit`, `linebreak`, `@react-pdf/renderer`, or `'node:fs'`/`'node:path'` — only `measure/estimator.ts` imports those (matches the existing `document-engine-boundary.test.ts` pattern at `tests/unit/estimate/document-engine-boundary.test.ts:11-20`, which greps 4 files for zero `@react-pdf/renderer`/`react`/`components/*` imports). **Extend that exact test file's array** (or add a sibling `tests/unit/pagination/pagination-engine-boundary.test.ts` following the identical pattern) to cover the new `lib/estimate/pagination/{types,rules,engine,blocks-from-model}.ts` files, explicitly excluding `measure/estimator.ts` from that boundary check (it's the one file allowed to import `fontkit`/`linebreak`/`node:fs`).

`measure/types.ts`'s `MeasurementProvider` interface (a plain function-shaped contract, e.g. `{ lineCount(text, styleKey, maxWidthPt): number }`) is the one thing BOTH the server estimator (this phase) and Phase 185's DOM implementation depend on — keep it framework-agnostic (no `fontkit`/DOM types in the interface signature itself, only primitive types).

### Code Examples

**Measurement provider sketch (server-only) — confirmed against `@react-pdf/pdfkit`'s own internal usage (`node_modules/@react-pdf/pdfkit/lib/pdfkit.js:37417-37499` for `font.layout()`/`advanceWidth`, `:37838` for `LineBreaker`):**

```ts
// lib/estimate/pagination/measure/estimator.ts — SERVER ONLY
import fontkit from 'fontkit'
import LineBreaker from 'linebreak'

// One fontkit.Font per TTF path, opened once and cached — mirrors
// lib/pdf/register-fonts.ts's "register once at module scope" discipline
// (Pitfall 4: re-parsing the same font file per render is wasted CPU AND a
// determinism risk if ever done lazily per-request).
const fontCache = new Map<string, ReturnType<typeof fontkit.openSync>>()
function openFont(ttfPath: string) {
  let font = fontCache.get(ttfPath)
  if (!font) {
    font = fontkit.openSync(ttfPath)
    fontCache.set(ttfPath, font)
  }
  return font
}

// Greedy UAX#14 line-packer: linebreak finds WHERE breaking is legal,
// fontkit measures HOW WIDE each candidate chunk is. This is the same
// division of labor @react-pdf/pdfkit's own eachWord() uses internally.
export function estimateLineCount(
  text: string,
  ttfPath: string,
  fontSizePt: number,
  maxWidthPt: number
): number {
  if (text.length === 0) return 0
  const font = openFont(ttfPath)
  const scale = fontSizePt / font.unitsPerEm
  const breaker = new LineBreaker(text)
  let lineWidthPt = 0
  let lines = 1
  let last = 0
  let bk: { position: number } | null
  while ((bk = breaker.nextBreak())) {
    const chunk = text.slice(last, bk.position)
    const { advanceWidth } = font.layout(chunk) // glyph run; advanceWidth in font units
    const chunkWidthPt = advanceWidth * scale
    if (lineWidthPt + chunkWidthPt > maxWidthPt && lineWidthPt > 0) {
      lines += 1
      lineWidthPt = chunkWidthPt
    } else {
      lineWidthPt += chunkWidthPt
    }
    last = bk.position
  }
  return lines
}
```

*(Sketch only — the exact `font.layout()` return shape and scale factor must be verified against the installed `fontkit@2.0.4` types/runtime behavior during implementation, and cross-checked in the spike below. `@react-pdf/pdfkit`'s own `layoutRun()` additionally scales by `1000 / font.unitsPerEm` before a second `size/1000` scale in `widthOfString()` — confirm which single-scale formula is equivalent before trusting this sketch's arithmetic verbatim.)*

**Explicit multi-page composition sketch (resolver + template):**

```ts
// lib/pdf/render-estimate-pdf.ts (post-184 sketch, extending the existing function)
import { computePageBreaks } from '@/lib/estimate/pagination/engine'
import { blocksFromModel } from '@/lib/estimate/pagination/blocks-from-model'
import { estimateLineCount } from '@/lib/estimate/pagination/measure/estimator'

// ...inside renderEstimatePdf(), after `estimate`/`signature`/`attachedPhotos` are resolved:
const pageAssignments = computePageBreaks(
  blocksFromModel({ estimate, signature, attachedPhotos, resolvedSettings: /* ... */ }),
  {
    pageHeightPt: LETTER_HEIGHT_PT,
    contentWidthPt: templateId === 'classic' ? 532 : 508,
    topPaddingPt: templateId === 'classic' ? 40 : 52,
    bottomPaddingPt: templateId === 'classic' ? 60 : 68,
    headerHeightPt: measureHeaderHeight(company, templateId), // data-dependent, computed once per render
  },
  { lineCount: (text, styleKey, maxWidthPt) => estimateLineCount(text, ttfPathFor(styleKey, templateId), fontSizeFor(styleKey), maxWidthPt) }
)
// pageAssignments threaded into EstimatePDFProps as a new `pages: PageAssignment[]` prop
```

```tsx
// components/pdf/estimate-pdf.tsx (post-184 sketch — replaces the single <Page>)
return (
  <Document>
    {pages.map((page, i) => (
      <Page key={i} size="LETTER" style={styles.page}>
        {PdfHeader({ /* ... */ })}{/* still `fixed` — repeats every page, per CONTEXT.md's "may remain" allowance */}
        {i === 0 && PdfTitleBanner({ /* ... */ })}
        {i === 0 && PdfInfoGrid({ /* ... */ })}
        {i === 0 && isSectionVisible(resolvedSettings, 'summary') && estimate.summary && (/* summary View */)}
        {page.continuesTable && PdfTableHeaderOnly({ L, styles /* NEW component: header row only, extracted from PdfSectionBlock */ })}
        {page.blocks.map((block) => renderBlockForKind(block /* section-header | item-row range | subtotal | totals | terms-card | signature | photo-row */))}
        {PdfFooter({ styles: { footer: styles.footer }, L })}{/* unchanged — react-pdf's pageNumber/totalPages already reflect N pages automatically */}
      </Page>
    ))}
  </Document>
)
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Glyph advance-width measurement | A custom TTF/OTF parser, or a `charCount × avgWidth` heuristic | `fontkit.openSync()` + `.layout()` | It's the exact code react-pdf renders with — zero risk of the estimator's predicted width diverging from what `renderToBuffer` actually draws |
| Line-break opportunity detection (where a line is legally allowed to wrap) | A naive `text.split(' ')` word-splitter | `linebreak`'s `LineBreaker`/UAX#14 iterator | Handles hyphens, CJK, and other break classes correctly — the same algorithm `@react-pdf/pdfkit`'s own `eachWord()` uses |
| "Page N of M" numbering | A manually-tracked page counter threaded through the engine's output | react-pdf's existing `fixed` + `render={({pageNumber,totalPages}) => ...}` (`pdf-footer.tsx:22-31`) | Already correct and already wired — react-pdf computes this from the ACTUAL rendered `<Page>` count, so it needs zero change once N explicit `<Page>`s exist |
| Repeated column header on continuation pages | A `fixed` prop on the table header (would repeat on EVERY page including page 1's non-continuing sections) | A small `PdfTableHeaderOnly` component the engine's `page.continuesTable` boolean gates per-page | react-pdf has no native `<thead>`-repeat-on-continuation semantics (confirmed absent in all 9 shared components) — this must be hand-built, but should be a trivial extraction from `PdfSectionBlock`'s existing table-header JSX (`pdf-section-block.tsx:80-90`), not new design |

**Key insight:** every primitive this phase needs (glyph metrics, line-break opportunities) is already a dependency of the exact renderer whose output must be predicted. The temptation to reach for a "simpler" heuristic (char-count-based wrapping) trades away the one property — measuring with react-pdf's own code — that makes the estimator trustworthy at all.

## Common Pitfalls

### Pitfall 1: Treating `PdfSectionBlock` as still-atomic after this phase

**What goes wrong:** `PdfSectionBlock` (`pdf-section-block.tsx:59-122`) currently renders a section's header, table header, ALL item rows, and subtotal as one function call producing one nested `View` tree. If Phase 184 doesn't split this into "header," "row-range," and "subtotal" as independently-placeable engine outputs, a section with more rows than fit on one page has no way to actually span pages — the whole point of the phase.

**Why it happens:** The Phase 183 extraction correctly treated the section as one visual/logical unit for the DE-DUPLICATION goal (no pagination existed yet) — that same shape is now the wrong shape for the PAGINATION goal.

**How to avoid:** Split `PdfSectionBlock` into 2-3 pieces the engine can place independently: a `PdfSectionHeader` (title only), a `PdfTableHeaderOnly` (extracted table-header row, reusable both for a section's first page AND continuation pages), and per-row rendering the resolver drives directly from the engine's item-range output — NOT a `.map()` over the WHOLE section's items in one call.

**Warning signs:** A plan that keeps `PdfSectionBlock`'s signature unchanged (`{ section, ... }` — the whole section) instead of accepting an item range/slice.

---

### Pitfall 2: Photo grid and terms-card atomicity gaps (see tables above) silently ship unfixed

**What goes wrong:** `PdfPhotoGrid`'s current `wrap={false}` on the ENTIRE grid (`pdf-photo-grid.tsx:40`) is MORE restrictive than the locked rule ("breaks only between rows") — if left as-is, a company with many photos gets a hard failure mode (react-pdf either crushes/overflows the block or silently produces an unpredictable result) rather than a clean page break between photo rows. `PdfTermsSection`'s lack of any per-card `wrap={false}` (`pdf-terms-section.tsx:66-101`) means a long Notes field could split mid-card today under emergent Yoga wrap — the opposite problem (not atomic enough).

**Why it happens:** Both components were built in Phase 183 for the byte-identical-content goal (no pagination existed) — their atomicity properties were never actually exercised against a real page boundary.

**How to avoid:** Explicitly restructure both components as part of this phase's plan (not an incidental side effect) — group photos into `photosPerRow = Math.floor(contentWidthPt / (150 + gap))`-sized row-chunks, each its own `wrap={false}` block the engine places; wrap each of `PdfTermsSection`'s 5 conditional `Fragment`s in its own `wrap={false}` `View`.

**Warning signs:** A plan or diff that touches `estimate-pdf.tsx`/`estimate-pdf-modern.tsx` to consume the engine's output but leaves `pdf-photo-grid.tsx`/`pdf-terms-section.tsx` byte-identical to their Phase 183 shape.

---

### Pitfall 3: The baseline-order test's direct-function-invocation pattern breaks once templates return N `<Page>`s

**What goes wrong:** `tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` calls `EstimatePDF({...})` **directly as a function** (no React renderer) and walks the single returned tree with `_pdf-text-walker.ts`'s `collectTextNodes` (`tests/unit/estimate/_pdf-text-walker.ts:25-39`), asserting a strict linear text-content order across the WHOLE document. Once `EstimatePDF` returns `<Document>{pages.map(...)}</Document>` with N pages, the walker will still work (it recurses through `.map()`-produced arrays fine), but the test's assumptions (e.g., "Materials section before Subtotal," "grand Total before Deposit") may no longer hold as simple linear `indexOf` comparisons if a section's rows are sliced across a page boundary and the engine reorders WHERE the repeated table header text appears relative to other blocks.

**Why it happens:** The test was written and extended (Plan 183-07) against a single-page, single-`<Page>` assumption — it has never been exercised against multi-page output.

**How to avoid:** Treat this test explicitly as a KNOWN file requiring updates in this phase's plan (per CONTEXT.md's "existing PDF tests stay green" + "add structural tests" regression guard) — either extend `buildFixtureEstimate` fixtures to a small (single-page, no actual pagination triggered) case to keep the CURRENT assertions valid unchanged, AND add new page-count/page-assignment-snapshot tests for a genuinely multi-page fixture, rather than trying to make the existing linear-order assertions somehow account for repeated headers across pages.

**Warning signs:** A plan that doesn't mention `estimate-pdf-baseline-order.test.tsx` at all in its files-affected list.

---

### Pitfall 4: Header height treated as a fixed token instead of computed-per-render

**What goes wrong:** If the pagination engine hardcodes a single `headerHeightPt` constant (e.g., copied from one company's rendered output during development), it will silently miscalculate available content height for every OTHER company whose header renders taller or shorter (missing phone, no logo, long address, etc.) — the exact "Configuration Scope Blindness" class of pitfall (assuming one observed case generalizes).

**Why it happens:** It's tempting to treat `tokens.ts`'s page-geometry constants (which really ARE fixed — 612×792, padding) as a complete page-geometry story, when `PdfHeader`'s content height is genuinely data-dependent and lives outside `tokens.ts` entirely.

**How to avoid:** Compute `headerHeightPt` from the actual `company` row being rendered, every time, before calling `computePageBreaks()` — never inline a literal. Add a fixture test with a company that has ALL optional fields empty (name only) vs. one with all fields + a logo, and assert the two get DIFFERENT computed content budgets.

**Warning signs:** A `PageConstraints` object built with a bare numeric literal for `headerHeightPt` anywhere in the resolver or its tests.

---

### Pitfall 5: Un-pinned `lineHeight` defaults make the estimator's formula unverifiable

**What goes wrong:** Several measurement-critical text styles (`tableCellText`, `tableHeaderText`, `totalsLabel`, `totalsValue`) declare `fontSize` but no explicit `lineHeight` — the row-height formula (`paddingVertical×2 + lineCount×lineHeight×fontSize`) needs a concrete `lineHeight` number, and guessing react-pdf/Yoga's internal default (rather than reading it from the installed version or empirically confirming it via a real `renderToBuffer`) risks an off-by-a-fraction-of-a-line error that compounds across many rows on a long estimate.

**Why it happens:** These styles were written when a single, unbroken `<Page wrap>` meant the exact row height never had to be predicted in advance — Yoga just laid it out and it worked, whatever the true default was.

**How to avoid:** Add an explicit `lineHeight` to every text style the estimator measures against BEFORE writing the height formula (this is a low-risk, additive style change — it does not change today's single-page visual output if the added value matches the current implicit default, which the spike/a small `renderToBuffer` smoke test can confirm empirically rather than asserting from training-data memory).

**Warning signs:** A height-estimation formula with a magic `lineHeight` constant that isn't traced back to an explicit style value or an empirically-confirmed default.

## Runtime State Inventory

Not applicable — this phase is a net-new module (`lib/estimate/pagination/`) plus structural PDF-template rewiring (single `<Page>` → N explicit `<Page>`s), not a rename/rebrand/string-replace/data-migration. No database keys, external service configs, OS-registered state, secret/env-var names, or build artifacts reference any string being renamed. (This section is retained per the research template's instruction to state findings explicitly rather than omit silently — but per the template's own trigger condition, a "SKIPPED" note is the correct outcome here.)

## Code Examples

See "Architecture Patterns → Code Examples" above for the measurement-provider and multi-page-composition sketches — both are load-bearing for this section and are not duplicated here.

## State of the Art

| Old approach (current code, pre-184) | New approach (this phase) | Why changed |
|---|---|---|
| One `<Page wrap>` per template; page breaks are emergent Yoga behavior, undecided until `renderToBuffer` actually runs | N explicit `<Page>` elements, positions decided BEFORE render by `computePageBreaks()` | CONTEXT.md's locked decision — "NEVER rely on emergent Yoga `wrap` for break decisions"; matches PITFALLS.md Pitfall 1/10 |
| `PdfSectionBlock` as one atomic function call per section (all rows together) | Split into header / repeatable table-header / independently-placed row ranges | Required for a section to actually span a page boundary |
| Photo grid: `wrap={false}` on the WHOLE grid (more atomic than needed) | Row-chunked, each row `wrap={false}` | Matches the locked rule ("breaks only between rows") exactly, no more no less |
| Terms block: all 5 cards in one `View`, no atomicity | Each card its own `wrap={false}` `View` | Matches the locked rule ("each terms card atomic") |
| `fontkit`/`linebreak` only present as undeclared transitive dependencies | Promoted to direct `dependencies` (+ `@types/fontkit` dev dep) | Required for a first-class, typed import from `lib/estimate/pagination/measure/estimator.ts` — relying on transitive resolution for a load-bearing module import is fragile across future `@react-pdf/renderer` upgrades that could change its own dependency versions |

## Open Questions

1. **Exact react-pdf default `lineHeight` for text styles that omit it**
   - What we know: `@react-pdf/pdfkit`'s text-layout code (`pdfkit.js`) computes line metrics from font ascent/descent/lineGap (`layoutRun`, lines 37409-37413) scaled by `1000/unitsPerEm` — but the actual DEFAULT `lineHeight` multiplier react-pdf's `<Text>` component applies when a style omits it was not confirmed from source in this research pass.
   - What's unclear: whether it's exactly `1.0`, or includes some font-metric-derived leading.
   - Recommendation: confirm empirically during implementation via a `renderToBuffer` smoke test on a known multi-line string at a known `fontSize`/width, measuring the actual rendered line spacing in the output PDF (e.g., via `pdf-parse` or a pixel/text-position library already in the test stack, if any) — OR simply add an explicit `lineHeight` to every measurement-critical style (recommended — removes the ambiguity entirely rather than reverse-engineering a default).

2. **The exact `fontkit`/`linebreak` API return-shape verification**
   - What we know: `@react-pdf/pdfkit`'s own source confirms `fontkit.openSync(src, family)`, `font.layout(text, features, undefined, undefined, 'ltr')` → `{ glyphs, positions, advanceWidth }`, and `new LineBreaker(text).nextBreak()` → `{ position, required }` (UAX#14 break points).
   - What's unclear: the precise unit scale of `advanceWidth` before/after the `1000/unitsPerEm` normalization `layoutRun` applies (font.layout()`'s raw `run.advanceWidth` vs. `@react-pdf/pdfkit`'s own additionally-scaled `widthOfString()` value) — the Code Examples sketch above flags this as unverified arithmetic.
   - Recommendation: write the estimator's first unit test against a known string/font/size with a HAND-CALCULATED expected width (from the TTF's own `hmtx` table or a simple monospace test font) before trusting the sketch's formula for real Inter/Lora glyphs.

3. **Whether page-count metadata should thread into the PDF route's ETag/contentKey**
   - What we know: CONTEXT.md marks this as explicitly Claude's discretion; `lib/pdf/render-estimate-pdf.ts`'s `contentKey` today is derived from `signature`/`updated_at` only (lines 117-120), with no page-count component.
   - What's unclear: whether adding page count to the cache key has any real benefit (page count is a pure function of already-keyed inputs — estimate content + template — so it shouldn't ever produce a DIFFERENT PDF for the same `contentKey` unless a bug exists).
   - Recommendation: leave `contentKey` unchanged unless the plan surfaces a concrete cache-correctness reason to add it — page count is derived, not independent, information.

4. **Empty-description item filtering must be applied consistently in `blocks-from-model.ts`**
   - What we know: both current templates filter `section.items.filter((i) => i.description.trim() !== '')` before rendering (`estimate-pdf.tsx:410-414`) — a pre-existing behavior, not new to this phase.
   - What's unclear: nothing functionally, but it's an easy detail to drop when rewriting the block-construction pipeline.
   - Recommendation: `blocks-from-model.ts` must replicate this exact filter (and the "sections with zero remaining items are dropped entirely" follow-on filter) — add a fixture test asserting a section with only-empty-description items produces zero `item-row` blocks and no orphaned `section-header` block for it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Server-side estimator, all of `lib/estimate/pagination/` | ✓ | 24.x (confirmed via `node -e` calls during this research) | — |
| `fontkit` | Measurement estimator | ✓ (transitive today) | `2.0.4` (latest) | Promote to direct dependency — no fallback needed, it's already proven to run in this exact deployment container |
| `linebreak` | Measurement estimator | ✓ (transitive today) | `1.1.0` (latest) | Same — promote to direct dependency |
| `@types/fontkit` | Typed estimator module | ✗ (not installed) | `2.0.9` on npm | `npm install -D @types/fontkit` — trivial, no blocking risk |
| `@react-pdf/renderer` | PDF rendering, unchanged | ✓ | `4.4.0` installed, `4.5.1` latest | Optional bump, not required |
| Vendored TTF fonts (Inter, Lora) | Measurement estimator needs the SAME files react-pdf renders with | ✓ | `public/fonts/inter/{Regular,Bold}.ttf`, `public/fonts/lora/{Regular,Bold}.ttf` (confirmed present) | — |
| Playwright + Chromium | Spike (browser-DOM measurement side) | ✓ | `@playwright/test@1.59.1`; Chromium binaries confirmed installed at `%LOCALAPPDATA%\ms-playwright\chromium-{1217,1223,1228}` and `chromium_headless_shell-*` | — |
| `tsx` (for running a standalone spike script) | Spike script execution | ✗ (not a `package.json` dependency) | latest via `npx tsx` | Existing repo convention already relies on `npx tsx scripts/*.ts` for one-off scripts (`scripts/storage-smoke.ts`'s own doc comment) — no new pattern needed, just `npx tsx` on demand |
| Vitest | Unit tests for the engine/rules/fixtures | ✓ | `vitest.config.ts` present at repo root; existing `tests/unit/pdf/*`, `tests/unit/estimate/*` suites use it | — |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** `@types/fontkit` (trivial install), `tsx` (already the established `npx`-on-demand convention for standalone scripts in this repo).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest.config.ts` at repo root) |
| Config file | `vitest.config.ts` (existing, no changes needed) |
| Quick run command | `npx vitest run tests/unit/pagination tests/unit/pdf` |
| Full suite command | `npx vitest run tests/unit tests/eval` (matches CI's `test.yml` gate exactly) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| PGBRK-01 | `computePageBreaks()` is a pure, deterministic function; same input → same output | unit | `npx vitest run tests/unit/pagination/engine.test.ts` | ❌ Wave 0 |
| PGBRK-01 | Boundary purity — `types.ts`/`rules.ts`/`engine.ts`/`blocks-from-model.ts` import zero `fontkit`/`linebreak`/`@react-pdf/renderer`/`node:fs` | unit | `npx vitest run tests/unit/pagination/pagination-engine-boundary.test.ts` | ❌ Wave 0 (extend `document-engine-boundary.test.ts`'s pattern) |
| PGBRK-02 | Row never splits; header keeps with first row; subtotal keeps with last row; totals/signature/terms-card atomic; photo grid breaks only between rows | unit (fixture-driven) | `npx vitest run tests/unit/pagination/rules.test.ts` — one fixture per rule, including an adversarial "almost but not quite fits" case per rule (Pitfall 10 from PITFALLS.md) | ❌ Wave 0 |
| PGBRK-03 | Continuation pages repeat the table header; every page shows "Page N of M" | unit (structural, direct-call) + `renderToBuffer` smoke | `npx vitest run tests/unit/pdf/estimate-pdf-pagination.test.tsx` (new — asserts the table header text appears once per continuation page in the walked tree) | ❌ Wave 0 |
| PGBRK-04 | PDF renders explicit `<Page>` elements from the engine's output; N-item estimate → expected page count + block-assignment snapshot | unit (structural + snapshot) | `npx vitest run tests/unit/pdf/estimate-pdf-pagination.test.tsx` | ❌ Wave 0 |
| PGBRK-04 | Existing PDF tests stay green (regression) | unit | `npx vitest run tests/unit/pdf` (existing 7 files, INCLUDING the baseline-order test which needs its Pitfall-3 update) | ✅ (existing files, need updates — see Pitfall 3) |
| PGBRK-05 | Same registered font family (TTF) in both surfaces; measurement provider built on `fontkit`+`linebreak` | unit | `npx vitest run tests/unit/pagination/measure/estimator.test.ts` (hand-calculated expected line count for a known string/font/width, per Open Question 2) | ❌ Wave 0 |
| PGBRK-05 | Measurement-drift spike validates the approach; safety margin is data-derived, not guessed | manual-run script + short doc | `npx tsx scripts/pagination-drift-spike.ts` (see Spike Design below) — NOT a CI-gated automated test; its OUTPUT (the margin constant) feeds a normal unit test asserting the engine applies that constant | ❌ Wave 0 (new standalone script, output committed as a constant + a short markdown note, not a recurring CI check) |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/pagination tests/unit/pdf` (fast, scoped)
- **Per wave merge:** `npx vitest run tests/unit tests/eval` (full suite, matches CI)
- **Phase gate:** Full suite green + `npx tsc -p tsconfig.ci.json --noEmit` clean before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `lib/estimate/pagination/types.ts`, `rules.ts`, `engine.ts`, `blocks-from-model.ts`, `measure/types.ts`, `measure/estimator.ts` — none exist yet (confirmed via `Glob`)
- [ ] `tests/unit/pagination/` directory — does not exist yet (confirmed via `Glob`); needs `engine.test.ts`, `rules.test.ts`, `pagination-engine-boundary.test.ts`, `measure/estimator.test.ts`
- [ ] `tests/unit/pdf/estimate-pdf-pagination.test.tsx` — new structural test for N-page composition + repeated table header + block-assignment snapshots (both templates)
- [ ] A multi-page fixture in `tests/unit/estimate/fixtures/document-fixtures.ts` — the existing `buildFixtureEstimate()` produces a small, single-page estimate; add a variant with enough sections/items to force ≥2 pages, plus edge-case strings (long unbroken tokens, accented characters, very long description) for the estimator's unit tests
- [ ] `scripts/pagination-drift-spike.ts` — does not exist yet; see Spike Design below
- [ ] Framework install: `npm install fontkit@^2.0.4 linebreak@^1.1.0 && npm install -D @types/fontkit@^2.0.9`

## Spike Design (PGBRK-05)

**Goal:** produce ONE number (or small table, by font-size tier) — the safety margin the estimator's line-count/height predictions must add to guarantee they never UNDER-predict a real react-pdf render, calibrated against real browser DOM text layout for the same TTF.

**Why a real browser is required, not jsdom:** jsdom does not implement real text shaping/line-wrapping (`getBoundingClientRect()`/`getClientRects()` on wrapped text in jsdom return synthetic/zero-based geometry, not real glyph-metric-driven layout) — an honest DOM-side measurement needs an actual browser rendering engine. This repo already has that: `@playwright/test@1.59.1` with Chromium binaries verified present at `%LOCALAPPDATA%\ms-playwright\chromium-{1217,1223,1228}` (multiple versions, all installed).

**Recommended approach — a standalone script, NOT a Playwright-config-driven e2e spec:**

The existing `tests/e2e/*.spec.ts` suite runs through `playwright.config.ts`, which requires the full Next.js dev server (`webServer: { command: 'bun run dev', ... }`) and an authenticated storage state. The spike needs neither — it only needs a browser to render static HTML with the SAME vendored TTF via `@font-face`. Building it as a standalone script avoids coupling the spike to app auth/server lifecycle:

```ts
// scripts/pagination-drift-spike.ts — run via `npx tsx scripts/pagination-drift-spike.ts`
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { estimateLineCount } from '../lib/estimate/pagination/measure/estimator'

const FONT_PATH = path.join(process.cwd(), 'public/fonts/inter/Inter-Regular.ttf')
const FONT_BASE64 = readFileSync(FONT_PATH).toString('base64')

// Representative estimate text, per Objective item 4's categories:
const SAMPLES: { label: string; text: string; fontSizePt: number; widthPt: number }[] = [
  { label: 'short-description', text: 'Replace kitchen faucet', fontSizePt: 9, widthPt: 213 },
  { label: 'long-description', text: 'Full demolition and reframing of the north wall including electrical rough-in and drywall patching', fontSizePt: 9, widthPt: 213 },
  { label: 'accented', text: 'Instalação de piso vinílico com acabamento acústico e rodapé embutido', fontSizePt: 9, widthPt: 213 },
  { label: 'numeric-heavy', text: '2x 4x8 sheets @ $48.99/ea, 12x #10-24 x 1.5" screws, tax 8.25%', fontSizePt: 9, widthPt: 213 },
  { label: 'single-long-token', text: 'https://example.com/very/long/unbroken/url/segment/that/might/not/wrap/cleanly', fontSizePt: 9, widthPt: 213 },
]

async function measureDomLineCount(page: import('@playwright/test').Page, text: string, fontSizePt: number, widthPt: number): Promise<number> {
  // pt → px through the SAME PT_PER_PX/PX_PER_PT conversion tokens.ts defines —
  // no second hand-derived ratio (Pitfall 2 in PITFALLS.md).
  const widthPx = widthPt * (96 / 72)
  const fontSizePx = fontSizePt * (96 / 72)
  await page.setContent(`
    <style>
      @font-face { font-family: 'Inter'; src: url(data:font/ttf;base64,${FONT_BASE64}); }
      #probe { font-family: 'Inter'; font-size: ${fontSizePx}px; width: ${widthPx}px; line-height: 1; }
    </style>
    <div id="probe">${text}</div>
  `)
  return await page.evaluate(() => {
    const el = document.getElementById('probe')!
    const range = document.createRange()
    range.selectNodeContents(el)
    const rects = range.getClientRects() // one rect per wrapped visual line
    return rects.length
  })
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const results: { label: string; fontkitLines: number; domLines: number; drift: number }[] = []
  for (const s of SAMPLES) {
    const fontkitLines = estimateLineCount(s.text, FONT_PATH, s.fontSizePt, s.widthPt)
    const domLines = await measureDomLineCount(page, s.text, s.fontSizePt, s.widthPt)
    results.push({ label: s.label, fontkitLines, domLines, drift: domLines - fontkitLines })
  }
  await browser.close()
  console.table(results)
  const maxDrift = Math.max(...results.map((r) => Math.abs(r.drift)))
  console.log(`Recommended safety margin: ${maxDrift} extra line(s) of buffer per estimated block (max observed drift across ${results.length} samples).`)
}
main()
```

**Safety-margin formula:** `safetyMarginLines = max(|domLines − fontkitLines|)` across the representative sample set, applied additively to every estimated block's line count before the engine decides whether it fits remaining page space (i.e., `estimatedHeight = (lineCount + safetyMarginLines) × lineHeightPt`, never the raw unbuffered estimate). If the spike shows drift only in specific categories (e.g., only the single-long-token/URL case), consider a category-specific margin instead of one global constant — but start with the single global `max()` value for simplicity, and only split it if the spike data clearly justifies it.

**Acceptance threshold for the spike:** run it, record the `console.table` output verbatim into a short `docs`/`.planning` note (per CONTEXT.md: "Spike output is a short doc + the margin constant"), and hard-code the resulting `safetyMarginLines`/`safetyMarginPt` constant into `lib/estimate/pagination/rules.ts` or `engine.ts` with a comment citing the spike doc — do not leave it as a TODO or a guessed round number.

**Extending the sample set:** the 5 categories above satisfy the objective's "short/long/accented/numeric" requirement plus one extra (single unbroken long token, the classic hyphenation/URL edge case PITFALLS.md's Pitfall 3 calls out) — real estimate fixture data (from `tests/unit/estimate/fixtures/document-fixtures.ts`) should be added to this list once the multi-page fixture (Wave 0 gap above) exists, so the spike measures against realistic content, not only synthetic strings.

## Sources

### Primary (HIGH confidence — direct file reads, 2026-07-28)
- `components/pdf/estimate-pdf.tsx`, `components/pdf/estimate-pdf-modern.tsx` — full read, current 519/536-line composition
- `components/pdf/shared/pdf-header.tsx`, `pdf-info-grid.tsx`, `pdf-footer.tsx`, `pdf-title-banner.tsx`, `pdf-section-block.tsx`, `pdf-terms-section.tsx`, `pdf-totals-block.tsx`, `pdf-photo-grid.tsx`, `pdf-signature-block.tsx` — full read, all 9 shared components
- `lib/estimate/document/tokens.ts`, `format.ts`, `model.ts`, `labels.ts` — full read
- `lib/pdf/register-fonts.ts`, `lib/pdf/render-estimate-pdf.ts` — full read
- `node_modules/@react-pdf/pdfkit/lib/pdfkit.js` (lines 37361-37499, 37618, 37830-37845) — confirmed exact `fontkit`/`linebreak` API usage react-pdf itself relies on
- `node_modules/fontkit/package.json`, `node_modules/linebreak/package.json`, `node_modules/@react-pdf/renderer/package.json`, `node_modules/@react-pdf/pdfkit/package.json`, `node_modules/@react-pdf/font/package.json`, `node_modules/@react-pdf/textkit/package.json`, `node_modules/yoga-layout/package.json` — exact installed versions
- `npm view fontkit version`, `npm view linebreak version`, `npm view @react-pdf/renderer version`, `npm view @types/fontkit version` — registry ground truth
- `public/fonts/inter/*.ttf`, `public/fonts/lora/*.ttf` — confirmed vendored, TTF (not WOFF2)
- `%LOCALAPPDATA%\ms-playwright\` directory listing — confirmed Chromium binaries installed (`chromium-1217/1223/1228`, `chromium_headless_shell-*`)
- `playwright.config.ts`, `package.json` scripts — confirmed `npx tsx scripts/*.ts` convention (`scripts/storage-smoke.ts`'s own doc comment) and existing e2e infra's webServer/auth coupling (why the spike should NOT use `tests/e2e/`)
- `tests/unit/pdf/estimate-pdf-baseline-order.test.tsx`, `tests/unit/estimate/_pdf-text-walker.ts`, `tests/unit/estimate/pt-px-conversion-source.test.ts`, `tests/unit/estimate/document-engine-boundary.test.ts`, `tests/unit/pdf/render-estimate-pdf-resolver.test.ts`, `tests/unit/estimate/fixtures/document-fixtures.ts` — full/partial read, existing test constraints
- `.planning/phases/183-pdf-parity-content/183-04-SUMMARY.md`, `183-06-SUMMARY.md` — Phase 183's exact deliverables and the direct-function-invocation convention's rationale
- `.planning/phases/184-consolidated-pagination-engine/184-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/config.json` — locked decisions, requirement IDs, `nyquist_validation: true`

### Secondary (MEDIUM confidence — milestone-level research docs, cross-referenced and in places corrected against the live post-183 code)
- `.planning/research/STACK.md` — fontkit/linebreak recommendation confirmed correct and current against the live `node_modules` tree; `minPresenceAhead` do-not-rely-on guidance confirmed (zero current usage in the codebase)
- `.planning/research/PITFALLS.md` — Pitfalls 1, 2, 3, 4, 10, 11 directly informed this file's Pitfalls section; codebase evidence cited there (pre-183 line numbers) is now superseded by this file's post-183 citations
- `.planning/research/FEATURES.md` — break-rule table-stakes list confirmed consistent with CONTEXT.md's locked rules; one tension noted (its "letterhead never repeats" claim vs. the current codebase's `fixed`-header-repeats-every-page behavior, resolved in favor of CONTEXT.md's explicit "`fixed` may remain" allowance)
- `.planning/research/ARCHITECTURE.md` — pre-183 file-layout sketch for `lib/estimate/pagination/` confirmed still directionally correct; its measurement-strategy recommendation (avoid real font-metric measurement, use a heuristic) is explicitly SUPERSEDED by STACK.md/CONTEXT.md's later, more specific fontkit+linebreak mandate — flagged inline above, not silently adopted

## Metadata

**Confidence breakdown:**
- Standard stack (fontkit/linebreak/react-pdf versions): HIGH — every version number confirmed against both the installed `node_modules` tree and the live npm registry, not training-data memory
- Block inventory / page geometry / atomicity gaps: HIGH — read directly from the live post-183 source files with exact line citations
- Measurement-drift safety margin: LOW until the spike runs — this file designs the spike, it deliberately does not assert a margin number
- `lineHeight` default / exact `font.layout()` scale arithmetic: MEDIUM-LOW — confirmed the API shape from `@react-pdf/pdfkit`'s own source, but did not execute a live `renderToBuffer` to verify the exact numeric defaults — flagged as Open Questions 1/2 for implementation-time verification

**Research date:** 2026-07-28
**Valid until:** ~30 days for the stack/version findings (stable ecosystem, low churn risk); the measurement-drift margin itself does not expire on a calendar basis — it is invalidated by any future change to the vendored TTF files, `fontSize`/`lineHeight` tokens, or column-width tokens, whichever comes first
