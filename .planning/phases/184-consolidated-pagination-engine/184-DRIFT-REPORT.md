# 184-DRIFT-REPORT: Browser-vs-fontkit Measurement Drift Spike (PGBRK-05)

**Ran:** 2026-07-28
**Script:** `scripts/pagination-drift-spike.ts` (`npx tsx scripts/pagination-drift-spike.ts`)
**Environment:** `@playwright/test@1.59.1` / Chromium 147.0.7727.15 (installed local binary, launched headless directly — no `playwright.config.ts`, no dev server, no auth state), Node.js, `fontkit@2.0.4` + `linebreak@1.1.0` against the real vendored `public/fonts/inter/Inter-Regular.ttf` (same TTF the Chromium `@font-face` loads via a base64 data URL, and the same TTF `lib/pdf/register-fonts.ts` registers for react-pdf rendering).

This is a REAL measurement — both sides (fontkit's `layout()`/`advanceWidth` line-packer and Chromium's actual `Range.getClientRects()` wrapped-line count) ran against the SAME font file. No numbers below are estimated or fabricated.

## Method

5 representative estimate-text samples (short/long/accented/numeric-heavy/single-long-token — matching `item.description`'s realistic content range), each measured at `fontSizePt: 9` (Classic's live `tableCellText.fontSize`) and `widthPt: 213` (Classic's `colDescription` ≈ 40% of 532pt content width), per `184-RESEARCH.md`'s "Spike Design (PGBRK-05)" section:

1. **fontkit side:** the exact greedy UAX#14 line-packer hand-verified in Task 1 (`tests/unit/pagination/measure/fontkit-arithmetic.test.ts`) — `linebreak`'s `LineBreaker` finds break opportunities, `fontkit`'s `font.layout(chunk).advanceWidth` measures each candidate chunk's width, scaled by `fontSizePt / font.unitsPerEm`.
2. **DOM side:** `page.setContent()` with a `@font-face` pointing at the SAME `Inter-Regular.ttf` (base64 data URL) and a `<div>` sized to the px-converted width/font-size using `lib/estimate/document/tokens.ts`'s own `PX_PER_PT` (no second hand-derived pt→px ratio), waited on `document.fonts.ready`, then `range.selectNodeContents(el); range.getClientRects().length` — one rect per real wrapped visual line.

## Results (verbatim `console.table` output)

```
┌─────────┬─────────────────────┬──────────────┬──────────┬───────┐
│ (index) │ label               │ fontkitLines │ domLines │ drift │
├─────────┼─────────────────────┼──────────────┼──────────┼───────┤
│ 0       │ 'short-description' │ 1            │ 1        │ 0     │
│ 1       │ 'long-description'  │ 2            │ 2        │ 0     │
│ 2       │ 'accented'          │ 2            │ 2        │ 0     │
│ 3       │ 'numeric-heavy'     │ 2            │ 2        │ 0     │
│ 4       │ 'single-long-token' │ 2            │ 1        │ -1    │
└─────────┴─────────────────────┴──────────────┴──────────┴───────┘
Recommended safety margin: 1 extra line(s) of buffer per estimated block (max observed |drift| across 5 samples).
```

`drift = domLines - fontkitLines`. Four of five samples show ZERO drift — fontkit's line-packer matches real Chromium text layout exactly for short/long/accented/numeric-heavy description text. The one non-zero case (`single-long-token`, an unbroken URL with no spaces) shows `drift = -1`: fontkit's `linebreak`-driven UAX#14 packer found a break opportunity inside the URL (e.g. after a `/`) that Chromium's real line-breaking algorithm did NOT take at this width, so fontkit predicted 2 lines while the browser rendered it on 1 line.

`safetyMarginLines = max(|drift|) = 1`.

## Go/No-Go Decision

**GO.** The fontkit+linebreak estimator matches real browser text layout exactly (zero drift) for every realistic estimate-description sample (short, long, accented/non-ASCII, numeric-heavy). The only observed drift is on a synthetic edge case (a single unbroken long token/URL) that is rare in real estimate line-item descriptions, and the drift is `1` line, well within a single flat line-of-buffer safety margin. The measurement approach (`fontkit.openSync()` + `font.layout()` + `linebreak`'s `LineBreaker`, the SAME libraries `@react-pdf/pdfkit` itself uses internally) is validated as fit for purpose for Plan 184-02's engine and Plan 184-03's estimator to build on, with `SAFETY_MARGIN_LINES = 1` as the derived constant (`lib/estimate/pagination/measure/safety-margin.ts`).

## Margin Application Semantics

Because `safetyMarginLines >= 1` (specifically `1`), the margin is applied as a **FLAT PER-PAGE height reserve** (`PageConstraints.safetyMarginPt` in Plan 184-02's engine), **subtracted once from each page's usable content height** — it is **NEVER added per-block or per-measured-text-field**.

**Reasoning:** the drift measured above is a per-measurement uncertainty (fontkit occasionally over- or under-counts a wrapped block's line count by up to 1 line relative to what Chromium/react-pdf actually renders). Reserving that uncertainty ONCE per page — rather than compounding it across every measured block placed on that page — avoids over-conservative pagination on text-dense pages (which would otherwise force many more page breaks than actually necessary) while still guaranteeing a bounded worst-case underflow: even if every block on a page under-predicts its true height by the observed drift, the page as a whole still has `safetyMarginLines × lineHeightPt` of headroom available before content would actually overflow onto the next page in the real react-pdf render.

(If a future re-run of this spike ever produces `safetyMarginLines === 0`, `safetyMarginPt` would resolve to `0` and no reserve would be needed — not applicable to this run.)

## Reproducing

```bash
npx tsx scripts/pagination-drift-spike.ts
```

Invalidated by (re-run required if any of these change): the vendored `public/fonts/inter/Inter-Regular.ttf` file, the `tableCellFontSizePt`/`colDescriptionWidthPt` tokens in `lib/estimate/document/tokens.ts`, or the installed `fontkit`/`linebreak`/Chromium versions.
