import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentCompany,
  type DocumentClient,
} from '@/components/workspace/estimate/estimate-document'
import { EstimateDocumentModern } from '@/components/share/estimate-document-modern'
import {
  buildFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
  SIGNATURE_FIXTURE,
  PHOTO_WITH_CAPTION,
} from './fixtures/document-fixtures'

const company = FIXTURE_COMPANY as DocumentCompany
const client = { id: 'c1', name: 'Acme Client' } as unknown as DocumentClient
const TERMS = 'Valid for 30 days.'

function makeData(): EstimateDocumentData {
  return toFixtureDocumentData(
    buildFixtureEstimate({
      signature: SIGNATURE_FIXTURE,
      attachedPhotos: [PHOTO_WITH_CAPTION],
      payment_terms: 'Net 15',
    })
  ) as unknown as EstimateDocumentData
}

const common = {
  client,
  projectName: 'Deck Rebuild',
  projectType: null,
  estimateVersion: 1,
  estimateCreatedAt: '2026-01-01T00:00:00Z',
}

describe('Modern document — companyTerms + preparedBy', () => {
  it('renders Estimate Terms first and Prepared by between signature and photos', () => {
    const { container } = render(
      <EstimateDocumentModern
        data={makeData()}
        company={company}
        {...common}
        preparedBy="Jamie Lee"
        companyTerms={{ enabled: true, text: TERMS }}
      />
    )
    const text = container.textContent ?? ''
    expect(text).toContain(TERMS)
    expect(text).toContain('Jamie Lee')
    const terms = container.querySelector('[data-track-section="terms"]') as HTMLElement
    const firstLabel = terms.querySelector('p') as HTMLElement
    expect(firstLabel.textContent).toBe('Estimate Terms')
    expect(terms.textContent?.indexOf(TERMS)).toBeLessThan(terms.textContent!.indexOf('Net 15'))

    const sections = Array.from(container.querySelectorAll('[data-track-section]')).map((el) =>
      el.getAttribute('data-track-section')
    )
    const iTerms = sections.indexOf('terms')
    const iSig = sections.indexOf('signature')
    const iPrep = sections.indexOf('prepared-by')
    const iPhotos = sections.indexOf('photos')
    expect(iTerms).toBeGreaterThanOrEqual(0)
    expect(iTerms).toBeLessThan(iSig)
    expect(iSig).toBeLessThan(iPrep)
    expect(iPrep).toBeLessThan(iPhotos)
  })

  it('Classic view: prepared-by sits between signature and photos', () => {
    const { container } = render(
      <EstimateDocument
        mode="view"
        data={makeData()}
        company={company}
        {...common}
        preparedBy="Jamie Lee"
        companyTerms={{ enabled: true, text: TERMS }}
      />
    )
    const ids = Array.from(container.querySelectorAll('[data-page-block-id]')).map((el) =>
      el.getAttribute('data-page-block-id')
    )
    expect(ids.indexOf('terms-estimate')).toBeGreaterThanOrEqual(0)
    expect(ids.indexOf('terms-estimate')).toBeLessThan(ids.indexOf('signature'))
    expect(ids.indexOf('signature')).toBeLessThan(ids.indexOf('prepared-by'))
    expect(ids.indexOf('prepared-by')).toBeLessThan(ids.indexOf('photo-row-0'))
  })

  it('renders the terms card when only company terms exist (no other terms)', () => {
    const data = { ...makeData(), payment_terms: null, timeline: null, warranty_terms: null, notes: null }
    const { container } = render(
      <EstimateDocumentModern
        data={data as EstimateDocumentData}
        company={company}
        {...common}
        companyTerms={{ enabled: true, text: TERMS }}
      />
    )
    expect(container.querySelector('[data-track-section="terms"]')?.textContent).toContain(TERMS)
  })

  it('renders neither when props are absent, disabled, or empty', () => {
    for (const extra of [
      {},
      { companyTerms: { enabled: false, text: TERMS } },
      { companyTerms: { enabled: true, text: null }, preparedBy: null },
    ]) {
      const { container } = render(
        <EstimateDocumentModern data={makeData()} company={company} {...common} {...extra} />
      )
      const text = container.textContent ?? ''
      expect(text).not.toContain('Estimate Terms')
      expect(text).not.toContain(TERMS)
      expect(text).not.toContain('Prepared by')
      expect(container.querySelector('[data-track-section="prepared-by"]')).toBeNull()
    }
  })
})

describe('Header hierarchy — company text-2xl, project/client text-xl', () => {
  const renderers: Array<[string, () => HTMLElement]> = [
    [
      'classic view',
      () =>
        render(<EstimateDocument mode="view" data={makeData()} company={company} {...common} />)
          .container,
    ],
    [
      'classic edit',
      () =>
        render(
          <EstimateDocument
            mode="edit"
            dispatch={() => {}}
            data={makeData()}
            company={company}
            {...common}
          />
        ).container,
    ],
    [
      'modern',
      () =>
        render(<EstimateDocumentModern data={makeData()} company={company} {...common} />)
          .container,
    ],
  ]

  it.each(renderers)('%s: sizes', (_name, build) => {
    const c = build()
    const classOf = (t: string) =>
      Array.from(c.querySelectorAll('p')).find((p) => p.textContent === t)?.className ?? ''
    expect(classOf(company.name)).toMatch(/\btext-2xl\b/)
    expect(classOf(company.name)).toMatch(/\bfont-bold\b/)
    expect(classOf('Deck Rebuild')).toMatch(/\btext-xl\b/)
    expect(classOf('Deck Rebuild')).not.toMatch(/\btext-2xl\b/)
    expect(classOf('Acme Client')).toMatch(/\btext-xl\b/)
    expect(classOf('Acme Client')).not.toMatch(/\btext-2xl\b/)
  })

  it('Classic ESTIMATE band is compact below sm and unchanged on desktop', () => {
    const { container } = render(
      <EstimateDocument mode="view" data={makeData()} company={company} {...common} />
    )
    const h1 = container.querySelector('h1') as HTMLElement
    expect(h1.className).toContain('text-2xl')
    expect(h1.className).toContain('sm:text-4xl')
    expect(h1.className).not.toMatch(/(^|\s)text-3xl/)
    expect(h1.parentElement?.className).toContain('py-3')
    expect(h1.parentElement?.className).toContain('sm:py-6')
  })
})
