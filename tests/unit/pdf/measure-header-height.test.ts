// tests/unit/pdf/measure-header-height.test.ts
//
// Phase 184 Plan 05 (PGBRK-01/03/04) — measureHeaderHeightPt's corrected
// max(leftColumn, rightColumn) formula (Plan-checker warning 8). Expected
// numbers below are hand-computed from the SAME live StyleSheet values cited
// in lib/pdf/measure-header-height.ts's HEADER_LAYOUT map (duplicated here,
// independently, so a regression in either file's constants is caught) —
// mirrors the hand-validated-arithmetic discipline
// tests/unit/pagination/measure/fontkit-arithmetic.test.ts established.

import { describe, it, expect } from 'vitest'
import {
  measureHeaderHeightPt as measureHeaderHeightPtWith,
  measureCompactHeaderHeightPt,
  CONTINUATION_SECTION_TITLE_HEIGHT_PT,
  CONTINUATION_TABLE_HEADER_HEIGHT_PT,
} from '@/lib/pdf/measure-header-height'
import type { PdfHeaderCompany } from '@/components/pdf/shared/pdf-header'
import type { MeasurementProvider } from '@/lib/estimate/pagination/measure/types'
import { createFontkitMeasurementProvider } from '@/lib/estimate/pagination/measure/estimator'
const ONE_LINE: MeasurementProvider = { lineCount: () => 1 } // every header text on one line — keeps these hand-computed expectations independent of wrapping
const measureHeaderHeightPt = (c: PdfHeaderCompany, t: 'classic' | 'modern', l: Parameters<typeof measureHeaderHeightPtWith>[2]) =>
  measureHeaderHeightPtWith(c, t, l, ONE_LINE)

const NO_CONTACT: Omit<PdfHeaderCompany, 'name' | 'logo_url'> = {
  phone: null,
  email: null,
  website: null,
  address: null,
  city: null,
  state: null,
  zip: null,
}

function nameOnly(name = 'Acme'): PdfHeaderCompany {
  return { name, ...NO_CONTACT, logo_url: null }
}

function fullContact(name = 'Acme'): PdfHeaderCompany {
  return {
    name,
    phone: '+15125550100',
    email: 'jamie@acme.test',
    website: 'https://acme.test',
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    logo_url: 'https://acme.test/logo.png',
  }
}

// Left-column-driven: full contact + address, NO logo — left column (name +
// contact line + address line) is taller than the right column (langBadge
// only, no logo).
function tallLeftNoLogo(name = 'Acme'): PdfHeaderCompany {
  return {
    name,
    phone: '+15125550100',
    email: 'jamie@acme.test',
    website: 'https://acme.test',
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    logo_url: null,
  }
}

// Right-column-driven: name only (no contact/address lines), WITH a logo —
// right column (langBadge + gap + logo) is much taller than the left
// column (name line only).
function shortLeftWithLogo(name = 'Acme'): PdfHeaderCompany {
  return { name, ...NO_CONTACT, logo_url: 'https://acme.test/logo.png' }
}

// GAP 1 regression fixture (Phase 185 pre-flight verification, 2026-07-28):
// a full US street + city/state/zip address. lib/estimate/document/format.ts's
// formatAddress() joins these with '\n', rendered in ONE <Text> — this is a
// genuine 2-LINE address block, not 1.
function tallLeftNoLogoTwoLineAddress(name = 'Acme'): PdfHeaderCompany {
  return tallLeftNoLogo(name)
}

// A company with ONLY a zip (no street, no city/state) — formatAddress()
// still returns a truthy, single-line string here (no '\n' to join against).
function nameOnlyZipOnlyAddress(name = 'Acme'): PdfHeaderCompany {
  return { name, phone: null, email: null, website: null, address: null, city: null, state: null, zip: '78701', logo_url: null }
}

describe('measureHeaderHeightPt (PGBRK-01/03/04, corrected max(left,right) formula)', () => {
  it('name-only header is strictly shorter than a full header (contact + address + logo), classic', () => {
    const short = measureHeaderHeightPt(nameOnly(), 'classic', 'en')
    const full = measureHeaderHeightPt(fullContact(), 'classic', 'en')
    expect(short).toBeLessThan(full)
  })

  it('name-only header is strictly shorter than a full header (contact + address + logo), modern', () => {
    const short = measureHeaderHeightPt(nameOnly(), 'modern', 'en')
    const full = measureHeaderHeightPt(fullContact(), 'modern', 'en')
    expect(short).toBeLessThan(full)
  })

  it('classic: tall-left/no-logo header height is driven by the LEFT column (hand-computed, 2-line address)', () => {
    // GAP 1 fix: formatAddress() joins the street line + city/state/zip line
    // with '\n' (lib/estimate/document/format.ts:30) when BOTH exist, and
    // pdf-header.tsx renders the whole string in ONE <Text> — 2 lines here,
    // not 1.
    // left  = companyName(18 * LINE_HEIGHT['Inter-Bold']=1.21) + marginBottom(4)
    //         + contact(9 * prose=1.5) + address(2 lines * 9 * 1.5)
    //       = 21.78 + 4 + 13.5 + 27 = 66.28
    // right = 0   (English: no langBadge; no logo)
    // headerRow = max(66.28, 0) = 66.28
    // chrome = paddingBottom(16) + marginBottom(24) + borderBottomWidth(2) = 42
    // total = 108.28
    const height = measureHeaderHeightPt(tallLeftNoLogoTwoLineAddress(), 'classic', 'en')
    expect(height).toBeCloseTo(108.28, 5)
  })

  it('classic: an address with only a zip (no street/city/state — no embedded newline) charges exactly 1 address line', () => {
    // left  = companyName(18 * 1.21) + marginBottom(4) + address(1 line * 9 * 1.5)
    //       = 21.78 + 4 + 13.5 = 39.28
    // right = 0   (English: no langBadge; no logo)
    // headerRow = max(39.28, 0) = 39.28
    // chrome = 42
    // total = 81.28
    const height = measureHeaderHeightPt(nameOnlyZipOnlyAddress(), 'classic', 'en')
    expect(height).toBeCloseTo(81.28, 5)
  })

  it('classic: short-left/with-logo header height is driven by the RIGHT column (hand-computed, non-English: badge + gap + logo)', () => {
    // left  = companyName(18 * 1.21) + marginBottom(4) = 25.78   (no contact/address)
    // right = langBadge(9 * 1.5=13.5) + gap(6) + logoHeight(72) = 91.5
    // headerRow = max(25.78, 91.5) = 91.5
    // chrome = 42
    // total = 133.5
    const height = measureHeaderHeightPt(shortLeftWithLogo(), 'classic', 'es')
    expect(height).toBeCloseTo(133.5, 5)
  })

  it('modern: tall-left/no-logo header height is driven by the LEFT column (hand-computed, 2-line address)', () => {
    // GAP 1 fix — see the classic case's comment above for the root cause.
    // left  = companyName(15 * LINE_HEIGHT['Lora-Bold']=1.28) + marginBottom(5)
    //         + contact(9 * prose=1.6) + address(2 lines * 9 * 1.6)
    //       = 19.2 + 5 + 14.4 + 28.8 = 67.4
    // right = 0   (English: no langBadge; no logo)
    // headerRow = max(67.4, 0) = 67.4
    // chrome = paddingBottom(20) + marginBottom(32) + borderBottomWidth(0.75) = 52.75
    // total = 120.15
    const height = measureHeaderHeightPt(tallLeftNoLogoTwoLineAddress(), 'modern', 'en')
    expect(height).toBeCloseTo(120.15, 5)
  })

  it('modern: short-left/with-logo header height is driven by the RIGHT column (hand-computed, non-English: badge + gap + logo)', () => {
    // left  = companyName(15 * 1.28) + marginBottom(5) = 24.2   (no contact/address)
    // right = langBadge(8.5 * 1.6=13.6) + gap(8) + logoHeight(64) = 85.6
    // headerRow = max(24.2, 85.6) = 85.6
    // chrome = 52.75
    // total = 138.35
    const height = measureHeaderHeightPt(shortLeftWithLogo(), 'modern', 'es')
    expect(height).toBeCloseTo(138.35, 5)
  })

  it('is deterministic — identical args return the identical number', () => {
    const company = fullContact()
    const first = measureHeaderHeightPt(company, 'classic', 'en')
    const second = measureHeaderHeightPt(company, 'classic', 'en')
    expect(first).toBe(second)
  })

  it("'classic' and 'modern' produce different results for the SAME company", () => {
    const company = fullContact()
    expect(measureHeaderHeightPt(company, 'classic', 'en')).not.toBe(measureHeaderHeightPt(company, 'modern', 'en'))
  })
})

describe('measureHeaderHeightPt — language badge is non-English only', () => {
  it('classic English with a logo charges the logo ONLY (no badge line, no badge/logo gap)', () => {
    // right = logoHeight(72) = 72 (no langBadge, no gap) -> headerRow = 72; chrome = 42 -> 114
    expect(measureHeaderHeightPt(shortLeftWithLogo(), 'classic', 'en')).toBeCloseTo(114, 5)
  })

  it('modern English with a logo charges the logo ONLY (no badge line, no badge/logo gap)', () => {
    // right = logoHeight(64) = 64 -> headerRow = 64; chrome = 52.75 -> 116.75
    expect(measureHeaderHeightPt(shortLeftWithLogo(), 'modern', 'en')).toBeCloseTo(116.75, 5)
  })

  it.each(['pt', 'es'] as const)('a non-English (%s) header with a logo is taller than the English one by badge + gap', (lang) => {
    const en = measureHeaderHeightPt(shortLeftWithLogo(), 'classic', 'en')
    const other = measureHeaderHeightPt(shortLeftWithLogo(), 'classic', lang)
    expect(other - en).toBeCloseTo(9 * 1.5 + 6, 5)
    const enM = measureHeaderHeightPt(shortLeftWithLogo(), 'modern', 'en')
    const otherM = measureHeaderHeightPt(shortLeftWithLogo(), 'modern', lang)
    expect(otherM - enM).toBeCloseTo(8.5 * 1.6 + 8, 5)
  })

  it('left-column-driven headers (no logo) are language-independent', () => {
    expect(measureHeaderHeightPt(tallLeftNoLogo(), 'classic', 'en')).toBe(measureHeaderHeightPt(tallLeftNoLogo(), 'classic', 'es'))
    expect(measureHeaderHeightPt(tallLeftNoLogo(), 'modern', 'en')).toBe(measureHeaderHeightPt(tallLeftNoLogo(), 'modern', 'pt'))
  })
})

describe('measureCompactHeaderHeightPt (pages 2+, hand-computed from the compact* StyleSheet keys)', () => {
  it('classic: max(name 11*1.21, id 9*1.21) + paddingBottom(6) + marginBottom(14) + border(1)', () => {
    // 13.31 + 6 + 14 + 1 = 34.31
    expect(measureCompactHeaderHeightPt('classic')).toBeCloseTo(34.31, 5)
  })

  it('modern: max(name 11*1.28, id 8.5*1.28) + paddingBottom(8) + marginBottom(18) + border(0.75)', () => {
    // 14.08 + 8 + 18 + 0.75 = 40.83
    expect(measureCompactHeaderHeightPt('modern')).toBeCloseTo(40.83, 5)
  })

  it('is much shorter than the full header for a typical company, in both templates', () => {
    for (const tpl of ['classic', 'modern'] as const) {
      expect(measureCompactHeaderHeightPt(tpl)).toBeLessThan(measureHeaderHeightPt(nameOnly(), tpl, 'en') - 1)
    }
  })
})

describe('continuation-page repeated header reservation (section title "(cont.)" band + column header)', () => {
  it('classic title band: sectionHeader paddingVertical(8)x2 + sectionTitle 11 x LINE_HEIGHT[Inter-Bold] 1.21 (marginTop is 0 on the continuation band)', () => {
    // 16 + 13.31 = 29.31
    expect(CONTINUATION_SECTION_TITLE_HEIGHT_PT.classic).toBeCloseTo(29.31, 5)
  })

  it('modern title band: paddingVertical(6)x2 + borderBottomWidth(1) + sectionTitle 11 x LINE_HEIGHT[Lora-Bold] 1.28', () => {
    // 12 + 1 + 14.08 = 27.08
    expect(CONTINUATION_SECTION_TITLE_HEIGHT_PT.modern).toBeCloseTo(27.08, 5)
  })

  it('the engine reservation is the title band PLUS the column-header row (classic 13 + 9 x 1.21, modern 16.5 + 8.5 x 1.28)', () => {
    expect(CONTINUATION_TABLE_HEADER_HEIGHT_PT.classic).toBeCloseTo(13 + 9 * 1.21 + 29.31, 5)
    expect(CONTINUATION_TABLE_HEADER_HEIGHT_PT.modern).toBeCloseTo(16.5 + 8.5 * 1.28 + 27.08, 5)
  })
})

describe('measureHeaderHeightPt — the company name / contact / address WRAP in the left column', () => {
  const LONG = 'BrightPath Residential Remodeling & Custom Carpentry Services of Central Texas LLC'
  const real = createFontkitMeasurementProvider()
  const measure = (c: PdfHeaderCompany, t: 'classic' | 'modern', l: 'en' | 'pt' = 'en') => measureHeaderHeightPtWith(c, t, l, real)

  it('an 82-char company name wraps to 2+ lines and charges the extra lines (fuzz regression: it was charged as one line)', () => {
    for (const tpl of ['classic', 'modern'] as const) {
      const short = measure(nameOnly('Acme'), tpl)
      const long = measure(nameOnly(LONG), tpl)
      const nameLine = tpl === 'classic' ? 18 * 1.21 : 15 * 1.28
      expect(long - short).toBeGreaterThanOrEqual(nameLine - 1e-6)
      expect((long - short) / nameLine).toBeCloseTo(Math.round((long - short) / nameLine), 6) // whole extra lines
    }
  })

  it('a drawn logo (or the language chip) narrows the left column, so a borderline name wraps sooner', () => {
    const withLogo = { ...nameOnly(LONG), logo_url: 'data:image/png;base64,AAAA' }
    for (const tpl of ['classic', 'modern'] as const) {
      expect(measure(withLogo, tpl)).toBeGreaterThanOrEqual(measure(nameOnly(LONG), tpl))
    }
  })

  it('a short name is still ONE line (no change from the single-line arithmetic)', () => {
    for (const tpl of ['classic', 'modern'] as const) {
      expect(measure(nameOnly('Acme'), tpl)).toBeCloseTo(measureHeaderHeightPt(nameOnly('Acme'), tpl, 'en'), 9)
    }
  })
})
