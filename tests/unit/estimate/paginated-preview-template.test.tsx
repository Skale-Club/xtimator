// tests/unit/estimate/paginated-preview-template.test.tsx
//
// PaginatedPreview draws the company's template: Modern looks like the Modern
// PDF (serif, hairline rules, no brand fills, hero total, label+text terms),
// Classic keeps its brand-filled look. Both use the sheet padding of their own
// PDF page (ESTIMATE_PAGE_GEOMETRY) and the shared header hierarchy.
//
// Fixture: the REAL blocksFromModel()->computePageBreaks() pipeline (via
// tests/unit/pdf/_pages-for-fixture.ts) over a multi-page estimate that also
// carries summary, discount/tax/deposit, all terms, a signature and photos, so
// every block kind the preview can draw is on some sheet.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import { PaginatedPreview } from '@/components/workspace/estimate/paginated-preview'
import type { DocumentCompany, EstimateDocumentData } from '@/lib/estimate/document/model'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import { ESTIMATE_PAGE_GEOMETRY, LETTER_WIDTH_PT, PX_PER_PT } from '@/lib/estimate/document/tokens'
import { LABELS } from '@/lib/estimate/document/labels'
import { buildPagesForFixture } from '../pdf/_pages-for-fixture'
import {
  buildMultiPageFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
  SIGNATURE_FIXTURE,
  PHOTO_WITH_CAPTION,
  PHOTO_NO_CAPTION,
} from './fixtures/document-fixtures'

afterEach(cleanup)

const BRAND_RGB = 'rgb(37, 99, 235)' // FIXTURE_COMPANY.brand_primary_color (#2563eb)
const TERMS_TEXT = 'Estimate valid for 30 days.'

const company = {
  ...FIXTURE_COMPANY,
  estimate_terms_enabled: true,
  estimate_terms_text: TERMS_TEXT,
} as unknown as DocumentCompany & { estimate_terms_enabled: boolean; estimate_terms_text: string }

const client = {
  name: 'Pat Client',
  email: 'pat@client.test',
  phone: null,
  address: null,
  city: null,
  state: null,
  zip: null,
}

function build(templateId: EstimateTemplateId) {
  const estimate = buildMultiPageFixtureEstimate({
    summary: 'Summary of the work.',
    notes: 'Site access weekdays.',
    timeline: '6 weeks.',
    payment_terms: '30% deposit.',
    warranty_terms: '12 months.',
    subtotal: 4000,
    discount_type: 'percentage',
    discount_value: 10,
    discount_amount: 400,
    tax_rate: 0.0825,
    tax_amount: 297,
    total: 3897,
    deposit_type: 'percent',
    deposit_value: 30,
    balance_due: 2727.9,
    attachedPhotos: [PHOTO_WITH_CAPTION, PHOTO_NO_CAPTION],
    signature: SIGNATURE_FIXTURE,
  })
  const data = toFixtureDocumentData(estimate) as unknown as EstimateDocumentData
  const pages = buildPagesForFixture(estimate, company, templateId, {
    language: 'en',
    preparedBy: 'Jamie Lee',
    signature: SIGNATURE_FIXTURE,
    attachedPhotos: [PHOTO_WITH_CAPTION, PHOTO_NO_CAPTION],
  })
  return { data, pages }
}

function renderFor(templateId: EstimateTemplateId) {
  const { data, pages } = build(templateId)
  const utils = render(
    <PaginatedPreview
      data={data}
      pages={pages}
      company={company}
      templateId={templateId}
      language="en"
      client={client}
      projectName="Kitchen Remodel"
      projectType={null}
      preparedBy="Jamie Lee"
      estimateVersion={1}
      estimateSeq={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
      companyTerms={{ enabled: true, text: TERMS_TEXT }}
    />
  )
  return { ...utils, data, pages }
}

/** Every element whose inline style paints the brand colour as a BACKGROUND. */
function brandFilled(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[style]')).filter(
    (el) => el.style.backgroundColor === BRAND_RGB
  )
}

describe('PaginatedPreview — Modern template', () => {
  it('draws the Modern look: serif sheets, no brand-filled band, hairline section rule, no zebra, hero total', () => {
    const { container, data } = renderFor('modern')
    const sheets = container.querySelectorAll<HTMLElement>('[data-page-sheet]')
    expect(sheets.length).toBeGreaterThan(2)
    sheets.forEach((sheet) => expect(sheet.className).toContain('font-serif'))

    // Fill-free: neither the title nor a section header paints the brand colour.
    expect(brandFilled(container)).toHaveLength(0)

    // Section header = readable brand text over a dark bottom rule.
    const header = container.querySelector<HTMLElement>(`[data-page-block-id="${data.sections[0].id}-header"]`)!
    expect(header.className).toContain('border-b')
    expect(header.className).toContain('border-[#1f2937]')
    expect(header.style.backgroundColor).toBe('')

    // No zebra rows.
    expect(container.querySelectorAll('tr[data-item-id].bg-muted\\/40').length).toBe(0)
    expect(container.innerHTML).not.toContain('bg-muted/40')

    // Letter-spaced title with a short brand rule (no banner).
    const title = container.querySelector('h1')!
    expect(title.textContent).toBe(LABELS.en.estimate)
    expect(title.className).toContain('tracking-[0.15em]')
    expect(title.parentElement!.style.backgroundColor).toBe('')

    // Hero total in the brand colour.
    const hero = Array.from(container.querySelectorAll<HTMLElement>('p')).find((p) => p.textContent === '$3,897.00')!
    expect(hero).toBeTruthy()
    expect(hero.className).toContain('text-[40px]')
    expect(hero.style.color).not.toBe('')
  })

  it('draws terms as label + text without tinted cards, and the first terms card carries the PDF top spacing', () => {
    const { container } = renderFor('modern')
    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-page-block-id^="terms-"]'))
    expect(cards.map((c) => c.getAttribute('data-page-block-id'))).toEqual(
      expect.arrayContaining(['terms-estimate', 'terms-payment', 'terms-timeline', 'terms-warranty', 'terms-notes'])
    )
    for (const card of cards) {
      expect(card.className).not.toContain('rounded')
      expect(card.className).not.toContain('border')
      expect(card.querySelector('[class*="rounded"]')).toBeNull()
      expect(card.querySelectorAll('p')).toHaveLength(2) // label, then text
    }
    expect(cards.filter((c) => c.style.marginTop !== '')).toHaveLength(1)
    expect(cards.find((c) => c.style.marginTop !== '')).toBe(cards[0])
  })

  it('uses the Modern PDF page margins (52pt) as the sheet padding, so the content box is 508pt wide', () => {
    const { container } = renderFor('modern')
    const sheet = container.querySelector<HTMLElement>('[data-page-sheet="0"]')!
    const g = ESTIMATE_PAGE_GEOMETRY.modern
    const sidePx = ((LETTER_WIDTH_PT - g.contentWidthPt) / 2) * PX_PER_PT
    expect(parseFloat(sheet.style.paddingLeft)).toBeCloseTo(sidePx, 3)
    expect(parseFloat(sheet.style.paddingRight)).toBeCloseTo(sidePx, 3)
    expect(parseFloat(sheet.style.paddingTop)).toBeCloseTo(g.topPaddingPt * PX_PER_PT, 3)
    expect(sidePx).toBeCloseTo(52 * PX_PER_PT, 3)
  })

  it('renders the "(cont.)" band in the Modern style on continuation pages', () => {
    const { container, pages } = renderFor('modern')
    const titles = container.querySelectorAll<HTMLElement>('[data-testid="continuation-title"]')
    expect(titles.length).toBe(pages.filter((p) => p.continuesTable).length)
    expect(titles.length).toBeGreaterThan(0)
    for (const t of Array.from(titles)) {
      expect(t.textContent).toContain(LABELS.en.continued)
      expect(t.className).toContain('border-[#1f2937]')
      expect(t.style.backgroundColor).toBe('')
    }
  })
})

describe('PaginatedPreview — Classic template (unchanged look)', () => {
  it('keeps the Classic look: sans sheets, brand-filled title + section bands, zebra rows, tinted cards', () => {
    const { container, data } = renderFor('classic')
    container
      .querySelectorAll<HTMLElement>('[data-page-sheet]')
      .forEach((sheet) => expect(sheet.className).not.toContain('font-serif'))

    // Title banner + (at least) one section band are brand-filled.
    expect(brandFilled(container).length).toBeGreaterThan(1)
    const band = container.querySelector<HTMLElement>(`[data-page-block-id="${data.sections[0].id}-header"]`)!
    expect(band.style.backgroundColor).toBe(BRAND_RGB)
    expect(container.innerHTML).toContain('bg-muted/40')
    expect(container.querySelector('[data-page-block-id="terms-payment"] .rounded-lg')).toBeTruthy()
  })

  it('uses the Classic PDF page margins (40pt) as the sheet padding', () => {
    const { container } = renderFor('classic')
    const sheet = container.querySelector<HTMLElement>('[data-page-sheet="0"]')!
    expect(parseFloat(sheet.style.paddingLeft)).toBeCloseTo(40 * PX_PER_PT, 3)
    expect(parseFloat(sheet.style.paddingRight)).toBeCloseTo(40 * PX_PER_PT, 3)
    expect(parseFloat(sheet.style.paddingTop)).toBeCloseTo(40 * PX_PER_PT, 3)
  })

  it('section + continuation bands span the content width (no px-10 full-bleed) with the PDF 10pt title inset', () => {
    const { container, data } = renderFor('classic')
    const inset = 10 * PX_PER_PT
    const bands = [
      container.querySelector<HTMLElement>(`[data-page-block-id="${data.sections[0].id}-header"]`)!,
      container.querySelector<HTMLElement>('[data-testid="continuation-title"]')!,
    ]
    for (const band of bands) {
      expect(band, 'band must render').toBeTruthy()
      expect(band.className).not.toContain('px-10')
      expect(parseFloat(band.style.paddingLeft)).toBeCloseTo(inset, 3)
      expect(parseFloat(band.style.paddingRight)).toBeCloseTo(inset, 3)
    }
    // Nothing on a Classic sheet re-adds a per-block page gutter.
    expect(container.innerHTML).not.toContain('px-10')
  })
})

describe.each(['classic', 'modern'] as const)('PaginatedPreview — shared structure (%s)', (templateId) => {
  it('header hierarchy: company name text-2xl, project and client names text-xl, all bold', () => {
    const { container } = renderFor(templateId)
    const firstSheet = container.querySelector('[data-page-sheet="0"]')!
    const byText = (text: string) =>
      Array.from(firstSheet.querySelectorAll<HTMLElement>('p')).find((p) => p.textContent === text)!

    for (const [text, size] of [
      [FIXTURE_COMPANY.name, 'text-2xl'],
      ['Kitchen Remodel', 'text-xl'],
      ['Pat Client', 'text-xl'],
    ] as const) {
      const el = byText(text)
      expect(el, text).toBeTruthy()
      expect(el.className).toContain(size)
      expect(el.className).toContain('font-bold')
    }
  })
})

describe('PaginatedPreview — template parity', () => {
  it('stamps the same engine block ids on both templates (no block dropped by a template)', () => {
    const ids = (t: EstimateTemplateId) => {
      const { container } = renderFor(t)
      const found = Array.from(container.querySelectorAll('[data-page-block-id]')).map(
        (e) => e.getAttribute('data-page-block-id') as string
      )
      cleanup()
      return { found }
    }
    const classic = ids('classic')
    const modern = ids('modern')
    // Same document, same drawn blocks regardless of how many pages each
    // template's geometry needs: compare the SET of distinct ids per kind.
    const kinds = (found: string[]) => ({
      totals: found.includes('totals'),
      signature: found.includes('signature'),
      preparedBy: found.includes('prepared-by'),
      terms: found.filter((i) => i.startsWith('terms-')).sort(),
      headers: found.filter((i) => i.endsWith('-header')).sort(),
      subtotals: found.filter((i) => i.endsWith('-subtotal')).sort(),
      rows: found.filter((i) => i.includes('-row-')).length,
    })
    expect(kinds(modern.found)).toEqual(kinds(classic.found))
    expect(kinds(modern.found).totals).toBe(true)
    expect(kinds(modern.found).signature).toBe(true)
  })
})
