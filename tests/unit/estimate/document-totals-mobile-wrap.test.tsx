import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import {
  EstimateDocument,
  type EstimateDocumentData,
} from '@/components/workspace/estimate/estimate-document'

// Mobile overlap fix: at ~360px the edit-mode Discount/Deposit rows (label +
// type <select> + numeric input + computed amount) overflowed one line, so the
// "10 %" input overlapped the "-$150.00" amount. Below `sm` the controls take
// their own full-width line and the amount wraps beneath, right-aligned; from
// `sm` up the original single-line nowrap layout is preserved. jsdom has no
// layout, so this asserts the class structure that produces that behavior.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/actions/project', () => ({
  linkProjectToClient: vi.fn().mockResolvedValue({ data: {} }),
  unlinkProjectFromClient: vi.fn().mockResolvedValue({ data: {} }),
  renameProjectAction: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

const data: EstimateDocumentData = {
  summary: null,
  notes: null,
  timeline: null,
  payment_terms: null,
  warranty_terms: null,
  discount_type: 'percentage',
  discount_value: 10,
  discount_amount: 150,
  tax_rate: 0.0825,
  tax_amount: 111.38,
  subtotal: 1500,
  total: 1461.38,
  deposit_type: 'percent',
  deposit_value: 30,
  deposit: 438.41,
  balance_due: 1022.97,
  currency_code: 'USD',
  estimate_date: null,
  estimate_number: null,
  presentation_settings: null,
  sections: [
    {
      id: 's1',
      title: 'Section 1',
      subtotal: 1500,
      items: [{ id: 'i1', description: 'Item', quantity: 1, unit: 'ea', unit_price: 1500, total: 1500 }],
    },
  ],
}

function renderDoc(mode: 'edit' | 'view') {
  return render(
    <EstimateDocument
      mode={mode}
      dispatch={mode === 'edit' ? vi.fn() : undefined}
      data={data}
      brandColor="#000000"
      client={null}
      projectName="Test Project"
      projectType={null}
      estimateVersion={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
    />
  )
}

const cls = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)

describe.each([
  ['totals-discount-row', 'Discount', '-$150.00'],
  ['totals-deposit-row', 'Deposit', '-$438.41'],
])('edit-mode %s mobile wrapping', (testId, label, amountText) => {
  it('row wraps below sm and stays nowrap from sm up', () => {
    const { getByTestId } = renderDoc('edit')
    const row = getByTestId(testId)
    const c = cls(row)
    expect(c).toContain('flex')
    expect(c).toContain('flex-wrap')
    expect(c).toContain('sm:flex-nowrap')
    expect(c).toContain('justify-between')
    expect(c).toContain('gap-x-2')
    expect(c).toContain('gap-y-1')
  })

  it('controls group takes a full line below sm, flex-1 from sm up, and can shrink', () => {
    const { getByTestId } = renderDoc('edit')
    const row = getByTestId(testId)
    const controls = row.children[0]
    const c = cls(controls)
    expect(c).toContain('w-full')
    expect(c).toContain('sm:w-auto')
    expect(c).toContain('sm:flex-1')
    expect(c).toContain('min-w-0')
    // label + select + numeric input live together in the controls group
    expect(controls.textContent).toContain(label)
    expect(controls.querySelector('[role="combobox"]')).toBeTruthy()
    expect(controls.querySelector('input[type="number"]')).toBeTruthy()
  })

  it('computed amount is a sibling of (not inside) the controls, right-aligned and non-shrinking', () => {
    const { getByTestId } = renderDoc('edit')
    const row = getByTestId(testId)
    expect(row.children).toHaveLength(2)
    const controls = row.children[0]
    const amount = row.children[1]
    expect(amount.textContent).toBe(amountText)
    expect(controls.contains(amount)).toBe(false)
    const c = cls(amount)
    expect(c).toContain('shrink-0')
    expect(c).toContain('ml-auto')
  })
})

describe('view-mode totals unchanged', () => {
  it('renders no edit-mode wrap rows or editor controls', () => {
    const { queryByTestId, container } = renderDoc('view')
    expect(queryByTestId('totals-discount-row')).toBeNull()
    expect(queryByTestId('totals-deposit-row')).toBeNull()
    const totals = container.querySelector('[data-page-block-id="totals"]') as Element
    expect(totals.querySelector('input')).toBeNull()
    expect(totals.querySelector('[role="combobox"]')).toBeNull()
    expect(totals.innerHTML).not.toContain('flex-wrap')
  })

  it('keeps the plain justify-between discount and deposit rows', () => {
    const { container } = renderDoc('view')
    const totals = container.querySelector('[data-page-block-id="totals"]') as Element
    const discount = Array.from(totals.querySelectorAll('div')).find((d) =>
      (d.textContent ?? '').startsWith('Discount (10%)')
    ) as Element
    expect(discount).toBeTruthy()
    expect(cls(discount).join(' ')).toBe('flex justify-between text-base')
    const deposit = Array.from(totals.querySelectorAll('div')).find((d) =>
      (d.textContent ?? '').startsWith('Deposit required')
    ) as Element
    expect(deposit).toBeTruthy()
    expect(cls(deposit).join(' ')).toBe('flex justify-between text-base pt-2')
  })
})
