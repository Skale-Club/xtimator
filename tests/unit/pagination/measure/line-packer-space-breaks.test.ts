// tests/unit/pagination/measure/line-packer-space-breaks.test.ts
//
// react-pdf breaks text ONLY at ASCII spaces (@react-pdf/textkit wrapWords) and
// lib/pdf/register-fonts.ts disables hyphenation, so "Sherwin-Williams" is one
// unbreakable box in the PDF. The measurement packer must not wrap at a "-"
// (UAX#14 would allow it) or it would under-count lines. Uses a fake
// fixed-advance font (1pt per char at 10pt) so widths are exact and the test is
// independent of font files.
import { describe, it, expect } from 'vitest'
import { packLines, type PackableFont } from '@/lib/estimate/pagination/measure/line-packer'

const MONO: PackableFont = {
  unitsPerEm: 1000,
  layout: (text: string) => ({ advanceWidth: text.length * 100 }), // 10pt font -> 1pt per char
}
const lines = (text: string, widthPt: number) => packLines(MONO, text, 10, widthPt)

describe('packLines — breaks only where react-pdf can break', () => {
  it('does not break after an existing hyphen: "Sherwin-Williams" moves to the next line whole', () => {
    // "aaaa " = 5pt, "Sherwin-Williams" = 16pt. Width 12: the word cannot fit beside "aaaa" and is wider
    // than a line by itself -> 2 lines (react-pdf overflows it on its own line). UAX#14 would say 3.
    expect(lines('aaaa Sherwin-Williams', 12)).toBe(2)
  })

  it('does not break at "/" or an em dash either', () => {
    expect(lines('aaaa 2x4/6x6/8x8', 8)).toBe(2)
    expect(lines('aaaa kitchen—bath—pantry', 8)).toBe(2)
  })

  it('still breaks at spaces', () => {
    expect(lines('aaaa bbbb cccc', 8)).toBe(3) // chunks 5pt, 5pt, 4pt; no two fit in 8
    expect(lines('aaaa bbbb cccc', 100)).toBe(1)
  })

  it('a single word longer than the line is one line (react-pdf overflows, never breaks by characters)', () => {
    expect(lines('Pneumonoultramicroscopicsilicovolcanoconiosis', 10)).toBe(1)
  })

  it('returns 0 lines for empty text', () => {
    expect(lines('', 100)).toBe(0)
  })
})
