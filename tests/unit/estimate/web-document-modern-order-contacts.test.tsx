import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentCompany,
} from '@/components/workspace/estimate/estimate-document'
import { EstimateDocumentModern } from '@/components/share/estimate-document-modern'
import {
  buildFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
} from './fixtures/document-fixtures'

// Web parity with the PDF: Modern totals read
//   Subtotal -> Discount -> Tax -> [hero] Total -> Deposit -> Balance Due
// and the company header contacts are tappable links.

const company = FIXTURE_COMPANY as DocumentCompany

function makeData(): EstimateDocumentData {
  return toFixtureDocumentData(
    buildFixtureEstimate({ deposit_type: 'percent', deposit_value: 30, estimate_number: 'EST-1042' })
  ) as unknown as EstimateDocumentData
}

const common = {
  client: null,
  projectName: 'Test Project',
  projectType: null,
  estimateVersion: 1,
  estimateCreatedAt: '2026-01-01T00:00:00Z',
}

describe('Modern web totals order', () => {
  it('hero total sits between Tax and Deposit; Balance Due is last', () => {
    const { container } = render(
      <EstimateDocumentModern data={makeData()} company={company} {...common} />
    )
    const totals = container.querySelector('[data-track-section="totals"]') as HTMLElement
    const text = totals.textContent ?? ''
    const order = ['Subtotal', 'Discount', 'Tax', 'Total', 'Deposit', 'Balance Due'].map((l) =>
      text.indexOf(l)
    )
    order.forEach((i) => expect(i).toBeGreaterThanOrEqual(0))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('omits Deposit and Balance Due when no deposit is set', () => {
    const data = { ...makeData(), deposit_type: 'none', deposit_value: null, deposit: 0 }
    const { container } = render(
      <EstimateDocumentModern data={data as EstimateDocumentData} company={company} {...common} />
    )
    const text = container.querySelector('[data-track-section="totals"]')?.textContent ?? ''
    expect(text).not.toContain('Deposit')
    expect(text).not.toContain('Balance Due')
  })
})

describe('Company header contacts are tappable (Classic + Modern)', () => {
  const renderers: Array<[string, () => HTMLElement]> = [
    [
      'classic',
      () =>
        render(<EstimateDocument mode="view" data={makeData()} company={company} {...common} />)
          .container,
    ],
    [
      'modern',
      () =>
        render(<EstimateDocumentModern data={makeData()} company={company} {...common} />)
          .container,
    ],
  ]
  it.each(renderers)('%s: tel/mailto/https links with aria-hidden separators', (_n, go) => {
    const c = go()
    const header = c.querySelector('[data-track-section="header"]') as HTMLElement
    expect(header.querySelector(`a[href="tel:${company.phone}"]`)).not.toBeNull()
    expect(header.querySelector(`a[href="mailto:${company.email}"]`)).not.toBeNull()
    const web = header.querySelector(`a[href="${company.website}"]`) as HTMLAnchorElement
    expect(web).not.toBeNull()
    expect(web.target).toBe('_blank')
    expect(web.rel).toContain('noopener')
    const seps = header.querySelectorAll('span[aria-hidden="true"]')
    expect(seps.length).toBe(2)
  })
})
