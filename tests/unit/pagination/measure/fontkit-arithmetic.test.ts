// tests/unit/pagination/measure/fontkit-arithmetic.test.ts
//
// Plan 184-01, Task 1 — hand-calculated validation of the fontkit
// layout()/advanceWidth scale formula against the REAL vendored Inter TTF,
// BEFORE the estimator (Plan 184-03) builds the line-packer on top of it.
//
// This is a LOCAL, test-file-only copy of the `estimateLineCount` reference
// algorithm (184-01-PLAN.md's <known_facts> greedy line-packer) — it does
// NOT import from lib/estimate/pagination/measure/estimator.ts, which does
// not exist until Plan 184-03. Zero dependency on later-wave files.
import { describe, it, expect } from 'vitest'
import path from 'node:path'
// fontkit ships ONLY named ESM exports (no default) — a namespace import
// mirrors what `require('fontkit')` returns and works under both Node's
// "import" and "require" resolution conditions.
import * as fontkit from 'fontkit'
import LineBreaker from 'linebreak'

const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'inter', 'Inter-Regular.ttf')
const font = fontkit.openSync(FONT_PATH)

function estimateLineCount(
  text: string,
  font: ReturnType<typeof fontkit.openSync>,
  fontSizePt: number,
  maxWidthPt: number
): number {
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

describe('fontkit layout()/advanceWidth scale formula (hand-verified against public/fonts/inter/Inter-Regular.ttf)', () => {
  it('unitsPerEm === 2048', () => {
    expect(font.unitsPerEm).toBe(2048)
  })

  it("layout('H').advanceWidth === 1522", () => {
    expect(font.layout('H').advanceWidth).toBe(1522)
  })

  it("layout('HHHH').advanceWidth === 6088 (exactly 4 * 1522 — additive, no kerning surprise)", () => {
    expect(font.layout('HHHH').advanceWidth).toBe(6088)
    expect(font.layout('HHHH').advanceWidth).toBe(4 * 1522)
  })

  it("estimateLineCount('HHHH HHHH HHHH', font, 9, 30) === 3", () => {
    expect(estimateLineCount('HHHH HHHH HHHH', font, 9, 30)).toBe(3)
  })

  it("estimateLineCount('HHHH HHHH HHHH', font, 9, 60) === 2", () => {
    expect(estimateLineCount('HHHH HHHH HHHH', font, 9, 60)).toBe(2)
  })

  it("estimateLineCount('HHHH HHHH HHHH', font, 9, 100) === 1", () => {
    expect(estimateLineCount('HHHH HHHH HHHH', font, 9, 100)).toBe(1)
  })

  it("estimateLineCount('', font, 9, 100) === 0", () => {
    expect(estimateLineCount('', font, 9, 100)).toBe(0)
  })
})
