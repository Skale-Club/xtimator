// lib/estimate/pagination/measure/line-packer.ts
//
// Phase 185 Plan 01 (PGBRK-01/04) — the ONE isomorphic greedy line-packing
// core, extracted byte-identical from measure/estimator.ts's original loop
// (Plan 184-01's hand-validated arithmetic, tests/unit/pagination/measure/
// fontkit-arithmetic.test.ts's local reference copy). Shared by BOTH the
// server shell (measure/estimator.ts, fontkit.openSync via node:fs) and the
// browser shell (measure/browser-estimator.ts, fontkit.create via fetch) —
// each parses its own fontkit.Font differently, but once a Font object
// exists, the exact same packing loop measures it. This file itself is
// engine-pure EXCEPT for its legitimate 'linebreak' import (mirrors
// measure/estimator.ts's own existing exclusion in
// tests/unit/pagination/pagination-engine-boundary.test.ts — line-packer.ts
// is listed there too, alongside browser-estimator.ts).
//
// NO margin term here — the safety margin is applied per-page by the
// engine's caller via PageConstraints.safetyMarginPt, never per-block/here.
import LineBreaker from 'linebreak'

/** Structural shape both fontkit.Font (Node) and fontkit.Font (browser
 *  build) satisfy — packLines only ever needs these two members, so it
 *  never imports the fontkit package itself (keeping this file free of any
 *  Node-vs-browser build distinction). */
export interface PackableFont {
  unitsPerEm: number
  layout(text: string): { advanceWidth: number }
}

/**
 * The EXACT greedy line-packer both measurement shells call, parameterized
 * on an already-opened, structurally-typed font object instead of a
 * font-family string. Byte-identical logic to the pre-extraction loop —
 * no reinterpretation.
 */
export function packLines(font: PackableFont, text: string, fontSizePt: number, maxWidthPt: number): number {
  // Defensive, redundant guard (estimator.ts's own guard, BEFORE getFont(),
  // is what actually prevents a font parse on empty text server-side — see
  // that file's comment). Harmless here: the browser shell preloads all its
  // fonts unconditionally regardless of any individual call's text.
  if (text.length === 0) return 0

  // react-pdf (@react-pdf/textkit splitParagraphs) cuts a Text at every '\n' and
  // line-breaks each paragraph on its own, so a hard newline ALWAYS starts a new line
  // (an empty paragraph is one blank line) — e.g. the info grid's `street\ncity, ST zip`
  // address is 2+ lines even though each half fits on one. A newline at the very end of
  // the text adds no extra line. Without this the greedy loop below saw the whole text as
  // one paragraph and under-counted every multi-paragraph text by one line per newline.
  if (text.includes('\n')) {
    const paragraphs = text.split('\n')
    if (paragraphs[paragraphs.length - 1] === '') paragraphs.pop()
    let total = 0
    for (const paragraph of paragraphs) total += Math.max(1, packParagraph(font, paragraph, fontSizePt, maxWidthPt))
    return total
  }
  return packParagraph(font, text, fontSizePt, maxWidthPt)
}

/** Greedy-packs ONE paragraph (no '\n') — the pre-existing loop, unchanged. */
function packParagraph(font: PackableFont, text: string, fontSizePt: number, maxWidthPt: number): number {
  if (text.length === 0) return 0

  const scale = fontSizePt / font.unitsPerEm
  const breaker = new LineBreaker(text)
  let lineWidthPt = 0
  let lines = 1
  let last = 0
  let bk: { position: number; required?: boolean } | null

  while ((bk = breaker.nextBreak())) {
    // react-pdf (@react-pdf/textkit wrapWords) splits text ONLY at ASCII
    // spaces, and lib/pdf/register-fonts.ts disables hyphenation, so a word
    // such as "Sherwin-Williams", "2x4/6x6" or "kitchen—bath" is one
    // unbreakable box in the PDF. UAX#14 (`linebreak`) would also offer a
    // break after the "-", "/" or "—"; taking it here would let this
    // estimator wrap a line the renderer cannot, under-counting lines.
    // So accept a break only after a space (or a mandatory newline break /
    // the end of text); otherwise let the chunk keep growing.
    if (!bk.required && bk.position < text.length && text[bk.position - 1] !== ' ') continue
    const chunk = text.slice(last, bk.position)
    const { advanceWidth } = font.layout(chunk)
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
