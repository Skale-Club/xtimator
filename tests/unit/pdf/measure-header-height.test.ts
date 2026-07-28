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
import { measureHeaderHeightPt } from '@/lib/pdf/measure-header-height'
import type { PdfHeaderCompany } from '@/components/pdf/shared/pdf-header'

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

describe('measureHeaderHeightPt (PGBRK-01/03/04, corrected max(left,right) formula)', () => {
  it('name-only header is strictly shorter than a full header (contact + address + logo), classic', () => {
    const short = measureHeaderHeightPt(nameOnly(), 'classic')
    const full = measureHeaderHeightPt(fullContact(), 'classic')
    expect(short).toBeLessThan(full)
  })

  it('name-only header is strictly shorter than a full header (contact + address + logo), modern', () => {
    const short = measureHeaderHeightPt(nameOnly(), 'modern')
    const full = measureHeaderHeightPt(fullContact(), 'modern')
    expect(short).toBeLessThan(full)
  })

  it('classic: tall-left/no-logo header height is driven by the LEFT column (hand-computed)', () => {
    // left  = companyName(18 * LINE_HEIGHT['Inter-Bold']=1.21) + marginBottom(4)
    //         + contact(9 * prose=1.5) + address(9 * 1.5)
    //       = 21.78 + 4 + 13.5 + 13.5 = 52.78
    // right = langBadge(9 * 1.5) = 13.5   (no logo)
    // headerRow = max(52.78, 13.5) = 52.78
    // chrome = paddingBottom(16) + marginBottom(24) + borderBottomWidth(2) = 42
    // total = 94.78
    const height = measureHeaderHeightPt(tallLeftNoLogo(), 'classic')
    expect(height).toBeCloseTo(94.78, 5)
  })

  it('classic: short-left/with-logo header height is driven by the RIGHT column (hand-computed)', () => {
    // left  = companyName(18 * 1.21) + marginBottom(4) = 25.78   (no contact/address)
    // right = langBadge(9 * 1.5=13.5) + gap(6) + logoHeight(72) = 91.5
    // headerRow = max(25.78, 91.5) = 91.5
    // chrome = 42
    // total = 133.5
    const height = measureHeaderHeightPt(shortLeftWithLogo(), 'classic')
    expect(height).toBeCloseTo(133.5, 5)
  })

  it('modern: tall-left/no-logo header height is driven by the LEFT column (hand-computed)', () => {
    // left  = companyName(15 * LINE_HEIGHT['Lora-Bold']=1.28) + marginBottom(5)
    //         + contact(9 * prose=1.6) + address(9 * 1.6)
    //       = 19.2 + 5 + 14.4 + 14.4 = 53
    // right = langBadge(8.5 * 1.6=13.6) = 13.6   (no logo)
    // headerRow = max(53, 13.6) = 53
    // chrome = paddingBottom(20) + marginBottom(32) + borderBottomWidth(0.75) = 52.75
    // total = 105.75
    const height = measureHeaderHeightPt(tallLeftNoLogo(), 'modern')
    expect(height).toBeCloseTo(105.75, 5)
  })

  it('modern: short-left/with-logo header height is driven by the RIGHT column (hand-computed)', () => {
    // left  = companyName(15 * 1.28) + marginBottom(5) = 24.2   (no contact/address)
    // right = langBadge(8.5 * 1.6=13.6) + gap(8) + logoHeight(64) = 85.6
    // headerRow = max(24.2, 85.6) = 85.6
    // chrome = 52.75
    // total = 138.35
    const height = measureHeaderHeightPt(shortLeftWithLogo(), 'modern')
    expect(height).toBeCloseTo(138.35, 5)
  })

  it('is deterministic — identical args return the identical number', () => {
    const company = fullContact()
    const first = measureHeaderHeightPt(company, 'classic')
    const second = measureHeaderHeightPt(company, 'classic')
    expect(first).toBe(second)
  })

  it("'classic' and 'modern' produce different results for the SAME company", () => {
    const company = fullContact()
    expect(measureHeaderHeightPt(company, 'classic')).not.toBe(measureHeaderHeightPt(company, 'modern'))
  })
})
