// The paginated preview is a PRINT preview: it must look like the PDF, not
// like the web documents. The PDF registers exactly two weights per family
// (Inter / Inter-Bold and Lora / Lora-Bold — lib/pdf/register-fonts.ts), i.e.
// 400 and 700. A browser would happily render font-medium (500),
// font-semibold (600) or font-extrabold (800) with the variable app font, which
// the PDF can never show — so those weights must not appear in the preview
// sources. Use font-normal (400) or font-bold (700), chosen per block by
// whether the matching PDF style uses fontFamily or fontFamilyBold.
//
// One exception: the Classic ESTIMATE title is 800, because the PDF registers
// Inter-ExtraBold for exactly that style (ESTIMATE_DESIGN_TOKENS.classic
// .fontFamilyTitle). It is allowed only there, and only while that font is
// registered.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const TEMPLATE_DIR = 'components/workspace/estimate/preview-template'
const FILES = [
  'components/workspace/estimate/paginated-preview.tsx',
  ...readdirSync(TEMPLATE_DIR)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => join(TEMPLATE_DIR, f)),
]

const FORBIDDEN =
  /\bfont-(?:thin|extralight|light|medium|semibold|extrabold|black)\b|fontWeight\s*:\s*['"]?(?:100|200|300|500|600|800|900)['"]?/

describe('forbidden-weight pattern', () => {
  it('flags the weights the PDF cannot show and allows 400/700', () => {
    for (const bad of ['font-medium', 'font-semibold', 'font-extrabold', 'font-black', 'fontWeight: 600', 'fontWeight: "500"', 'fontWeight: 800']) {
      expect(FORBIDDEN.test(bad), bad).toBe(true)
    }
    for (const ok of ['font-normal', 'font-bold', 'fontWeight: 400', 'fontWeight: 700', 'font-bold uppercase']) {
      expect(FORBIDDEN.test(ok), ok).toBe(false)
    }
  })
})

describe('preview weights stay within the PDF-registered 400/700', () => {
  it('scans the preview sources', () => {
    expect(FILES.length).toBeGreaterThan(4)
  })

  for (const file of FILES) {
    it(`${file} uses no weight other than font-normal / font-bold`, () => {
      let source = readFileSync(file, 'utf8')
      if (/[\\/]preview-template[\\/]classic\.tsx$/.test(file)) {
        // The one sanctioned 800: the title banner's h1 (exactly once).
        const allowed = 'className="font-extrabold select-none"'
        expect(source.split(allowed).length - 1, 'classic title banner keeps its single font-extrabold').toBe(1)
        source = source.replace(allowed, '')
      }
      const m = FORBIDDEN.exec(source)
      expect(m, m ? `forbidden weight "${m[0]}" in ${file}` : '').toBeNull()
    })
  }
})

describe('the Classic title 800 is backed by a registered PDF font', () => {
  it('registers Inter-ExtraBold and points the Classic title at it', () => {
    const fonts = readFileSync('lib/pdf/register-fonts.ts', 'utf8')
    expect(fonts).toMatch(/family: 'Inter-ExtraBold', src: path\.join\(FONTS_DIR, 'inter', 'Inter-ExtraBold\.ttf'\)/)
    const tokens = readFileSync('lib/estimate/document/tokens.ts', 'utf8')
    expect(tokens).toMatch(/classic: \{[^}]*fontFamilyTitle: 'Inter-ExtraBold'/)
    expect(readFileSync('components/pdf/estimate-pdf.tsx', 'utf8')).toContain('fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamilyTitle')
  })
})
