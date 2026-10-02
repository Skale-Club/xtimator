// tests/unit/pagination/page-constraints.test.ts
//
// Phase 185 Plan 01 (PGBRK-01/04) — proves computeEstimatePageConstraints()
// introduced ZERO drift from the ORIGINAL inline formula it replaced (the
// exact formula this plan's PLAN.md <interfaces> block quotes verbatim).
// Independently recomputes the expected PageConstraints in this test file
// itself, using the same imported constants but NOT calling the function
// under test to derive its own expectation.
import { describe, it, expect } from 'vitest'
import { computeEstimatePageConstraints as computeWith } from '@/lib/estimate/pagination/page-constraints'
import type { MeasurementProvider } from '@/lib/estimate/pagination/measure/types'
import {
  measureHeaderHeightPt as measureWith,
  measureCompactHeaderHeightPt,
  CONTINUATION_TABLE_HEADER_HEIGHT_PT,
  PDF_RENDER_SAFETY_MARGIN_PT,
} from '@/lib/pdf/measure-header-height'
const ONE_LINE: MeasurementProvider = { lineCount: () => 1 } // every header text on one line — keeps these hand-computed expectations independent of wrapping
const computeEstimatePageConstraints = (c: Parameters<typeof computeWith>[0], t: Parameters<typeof computeWith>[1], l: Parameters<typeof computeWith>[2]) => computeWith(c, t, l, ONE_LINE)
const measureHeaderHeightPt = (c: Parameters<typeof measureWith>[0], t: Parameters<typeof measureWith>[1], l: Parameters<typeof measureWith>[2]) => measureWith(c, t, l, ONE_LINE)
import { SAFETY_MARGIN_LINES } from '@/lib/estimate/pagination/measure/safety-margin'
import { ESTIMATE_DESIGN_TOKENS, ESTIMATE_PAGE_GEOMETRY, LINE_HEIGHT, LETTER_HEIGHT_PT } from '@/lib/estimate/document/tokens'
import type { PdfHeaderCompany } from '@/components/pdf/shared/pdf-header'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

function company(overrides: Partial<PdfHeaderCompany> = {}): PdfHeaderCompany {
  return {
    name: 'Acme Construction LLC',
    phone: '5551234567',
    email: 'hello@acme.test',
    website: 'https://acme.test',
    address: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zip: '62704',
    logo_url: null,
    ...overrides,
  }
}

/** Independently recomputes PageConstraints via the ORIGINAL inline formula
 *  (mirrors lib/pdf/render-estimate-pdf.ts's pre-extraction derivation
 *  verbatim) — proves the extraction introduced zero drift. */
function expectedConstraints(c: PdfHeaderCompany, templateId: EstimateTemplateId, language: EstimateLanguage = 'en') {
  const geometry = ESTIMATE_PAGE_GEOMETRY[templateId]
  const headerHeightPt = measureHeaderHeightPt(c, templateId, language)
  const fontFamily = ESTIMATE_DESIGN_TOKENS[templateId].fontFamily
  const safetyMarginPt =
    SAFETY_MARGIN_LINES * (geometry.tableCellFontSizePt * LINE_HEIGHT[fontFamily]) + PDF_RENDER_SAFETY_MARGIN_PT
  return {
    // Page 1 draws the FULL header; pages 2+ the one-line COMPACT header.
    contentHeightPt: LETTER_HEIGHT_PT - geometry.topPaddingPt - geometry.bottomPaddingPt - headerHeightPt,
    continuationContentHeightPt:
      LETTER_HEIGHT_PT - geometry.topPaddingPt - geometry.bottomPaddingPt - measureCompactHeaderHeightPt(templateId),
    continuationTableHeaderHeightPt: CONTINUATION_TABLE_HEADER_HEIGHT_PT[templateId],
    safetyMarginPt,
  }
}

describe('computeEstimatePageConstraints — zero drift from the original inline formula', () => {
  const templateIds: EstimateTemplateId[] = ['classic', 'modern']

  for (const templateId of templateIds) {
    it(`${templateId}: with logo_url and a single-line address matches the independently recomputed formula`, () => {
      const c = company({ logo_url: 'https://acme.test/logo.png', address: '123 Main St', city: 'Springfield', state: 'IL', zip: '62704' })
      expect(computeEstimatePageConstraints(c, templateId, 'en')).toEqual(expectedConstraints(c, templateId, 'en'))
    })

    it(`${templateId}: without logo_url matches the independently recomputed formula`, () => {
      const c = company({ logo_url: null })
      expect(computeEstimatePageConstraints(c, templateId, 'en')).toEqual(expectedConstraints(c, templateId, 'en'))
    })

    it(`${templateId}: with a multi-line address (street + city/state/zip) matches the independently recomputed formula`, () => {
      const c = company({ address: '456 Oak Ave, Suite 200', city: 'Metropolis', state: 'NY', zip: '10001' })
      expect(computeEstimatePageConstraints(c, templateId, 'en')).toEqual(expectedConstraints(c, templateId, 'en'))
    })

    it(`${templateId}: without an address matches the independently recomputed formula`, () => {
      const c = company({ address: null, city: null, state: null, zip: null })
      expect(computeEstimatePageConstraints(c, templateId, 'en')).toEqual(expectedConstraints(c, templateId, 'en'))
    })

    it(`${templateId}: returns numeric contentHeightPt/continuationContentHeightPt/continuationTableHeaderHeightPt/safetyMarginPt`, () => {
      const result = computeEstimatePageConstraints(company(), templateId, 'en')
      expect(typeof result.contentHeightPt).toBe('number')
      expect(typeof result.continuationContentHeightPt).toBe('number')
      expect(typeof result.continuationTableHeaderHeightPt).toBe('number')
      expect(typeof result.safetyMarginPt).toBe('number')
    })
  }
})

describe('computeEstimatePageConstraints — compact header on pages 2+ and the non-English language chip', () => {
  for (const templateId of ['classic', 'modern'] as EstimateTemplateId[]) {
    it(`${templateId}: continuation pages get MORE room than page 1 (compact header is shorter than the full one)`, () => {
      const r = computeEstimatePageConstraints(company(), templateId, 'en')
      expect(r.continuationContentHeightPt).toBeGreaterThan(r.contentHeightPt)
    })

    it(`${templateId}: the continuation budget is independent of company contacts/logo/language`, () => {
      const plain = computeEstimatePageConstraints(company({ logo_url: null, address: null, city: null, state: null, zip: null }), templateId, 'en')
      const rich = computeEstimatePageConstraints(company({ logo_url: 'https://acme.test/logo.png' }), templateId, 'es')
      expect(rich.continuationContentHeightPt).toBe(plain.continuationContentHeightPt)
    })

    it(`${templateId}: with a logo, a non-English document has a SMALLER page-1 budget than English (chip + gap charged)`, () => {
      const c = company({ logo_url: 'https://acme.test/logo.png', phone: null, email: null, website: null, address: null, city: null, state: null, zip: null })
      const en = computeEstimatePageConstraints(c, templateId, 'en')
      for (const lang of ['es', 'pt'] as EstimateLanguage[]) {
        const other = computeEstimatePageConstraints(c, templateId, lang)
        expect(other.contentHeightPt).toBeLessThan(en.contentHeightPt)
        expect(other.continuationContentHeightPt).toBe(en.continuationContentHeightPt)
      }
    })
  }
})
