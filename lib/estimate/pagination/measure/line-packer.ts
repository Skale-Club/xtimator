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

  const scale = fontSizePt / font.unitsPerEm
  const breaker = new LineBreaker(text)
  let lineWidthPt = 0
  let lines = 1
  let last = 0
  let bk: { position: number } | null

  while ((bk = breaker.nextBreak())) {
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
