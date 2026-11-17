// Change order PDF: element-tree content checks (cheap, direct call like the
// estimate PDF tests) plus one real renderToBuffer smoke test.
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import ChangeOrderPDF from '@/components/pdf/change-order-pdf'
import { collectTextNodes } from '../estimate/_pdf-text-walker'
import { buildChangeOrderData, SIGNED } from '../share/change-order-fixtures'

function texts(data = buildChangeOrderData(), language?: string) {
  const out: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collectTextNodes(ChangeOrderPDF({ data, language }) as any, out)
  return out
}

describe('ChangeOrderPDF content', () => {
  it('has the band, reference line, reason, lines with credits negative, and totals', () => {
    const t = texts()
    expect(t).toContain('CHANGE ORDER #1')
    expect(t).toContain('SK-1045-CO1')
    expect(t).toContain('Estimate SK-1045')
    expect(t).toContain('The client asked to paint the garage too.')
    expect(t).toContain('Paint garage walls')
    expect(t).toContain('-$400.00')
    expect(t).toContain('Current contract')
    expect(t).toContain('$10,000.00')
    expect(t).toContain('This change order')
    expect(t).toContain('New total')
    expect(t).toContain('$11,100.00')
    expect(t).toContain('+3 days')
    expect(t).not.toContain('Approved and signed by')
  })

  it('shows tax only when there is some', () => {
    expect(texts().some((s) => s.startsWith('Tax ('))).toBe(false)
    const t = texts(buildChangeOrderData({ tax_rate: 0.1, subtotal: 1000, tax_amount: 100, total: 1100 }))
    expect(t).toContain('Tax (10%)')
  })

  it('adds the signature block when signed', () => {
    const t = texts(buildChangeOrderData({ status: 'accepted', hasSignature: true, signature: SIGNED }))
    expect(t).toContain('Approved and signed by')
    expect(t).toContain('Jane Doe')
  })

  it('follows the estimate language', () => {
    const data = buildChangeOrderData()
    data.estimate.language = 'pt'
    const t = texts(data)
    expect(t).toContain('ADITIVO #1')
    expect(t).toContain('Novo total')
  })
})

describe('ChangeOrderPDF render', () => {
  it('renderToBuffer smoke: a signed change order renders a real PDF', async () => {
    const data = buildChangeOrderData({ status: 'accepted', hasSignature: true, signature: SIGNED })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(createElement(ChangeOrderPDF, { data }) as any)
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.toString('latin1', 0, 4)).toBe('%PDF')
  })
})
