import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { useState, type Dispatch } from 'react'
import { renderToString } from 'react-dom/server'
import {
  EstimateDocument,
  type EstimateDocumentData,
} from '@/components/workspace/estimate/estimate-document'
import type { EstimateAction } from '@/components/workspace/estimate/use-estimate-reducer'

// Editor totals (2026-11-12 redesign): one three-column grid so every row is
// ONE line on every width (label | control | amount); Discount and Deposit
// appear only once added ("+ Discount" / "+ Deposit"), each with a single
// value field and a % / $ toggle; deposit and balance due sit in a Payment
// box apart from the price; the tax Default / Reset caption sits under the
// row. View mode (share page) is unchanged (document-totals-view.test.tsx).

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/actions/project', () => ({
  linkProjectToClient: vi.fn(),
  unlinkProjectFromClient: vi.fn(),
  renameProjectAction: vi.fn(),
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

function makeData(overrides: Partial<EstimateDocumentData> = {}): EstimateDocumentData {
  return {
    summary: null, notes: null, timeline: null, payment_terms: null, warranty_terms: null,
    discount_type: null, discount_value: 0, discount_amount: 0, tax_rate: 0.0825, tax_amount: 123.75,
    subtotal: 1500, total: 1623.75, deposit_type: 'none', deposit_value: null, deposit: 0, balance_due: 1623.75,
    currency_code: 'USD', estimate_date: null, estimate_number: null, presentation_settings: null,
    sections: [{ id: 's1', title: 'S', subtotal: 1500, items: [
      { id: 'i1', description: 'Item', quantity: 1, unit: 'ea', unit_price: 1500, total: 1500 },
    ] }],
    ...overrides,
  }
}

function editDocument(data: EstimateDocumentData, dispatch: Dispatch<EstimateAction>, defaultTaxRate?: number) {
  return (
    <EstimateDocument
      mode="edit"
      dispatch={dispatch}
      data={data}
      client={null}
      projectName="P"
      projectType={null}
      estimateVersion={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
      companyDefaults={defaultTaxRate === undefined ? undefined : ({ tax_rate: defaultTaxRate } as never)}
    />
  )
}

function renderEdit(data: EstimateDocumentData, defaultTaxRate?: number) {
  const dispatch = vi.fn()
  render(editDocument(data, dispatch, defaultTaxRate))
  return dispatch
}

function TaxEditingHarness({ initialData, onAction }: {
  initialData: EstimateDocumentData
  onAction: Dispatch<EstimateAction>
}) {
  const [data, setData] = useState(initialData)
  return editDocument(data, action => {
    onAction(action)
    if (action.type === 'UPDATE_TAX_RATE') setData(previous => ({ ...previous, tax_rate: action.tax_rate }))
  })
}

const totals = () => document.querySelector('[data-page-block-id="totals"]') as HTMLElement

describe('editor totals grid', () => {
  it('enables the totals controls after hydration and preserves the first tax edit on blur', async () => {
    const onAction = vi.fn()
    const element = (
      <TaxEditingHarness onAction={onAction} initialData={makeData({
        discount_type: 'percentage', discount_value: 10, discount_amount: 150,
        tax_rate: 0, tax_amount: 0, total: 1350,
        deposit_type: 'percent', deposit_value: 30, deposit: 405, balance_due: 945,
      })} />
    )
    const container = document.createElement('div')
    container.innerHTML = renderToString(element)
    document.body.append(container)
    let unmount: (() => void) | undefined
    try {
      const editor = within(container)
      const taxInput = () => editor.getByRole<HTMLInputElement>('textbox', { name: 'Tax' })
      const controls = () => [
        taxInput(),
        editor.getByRole<HTMLInputElement>('textbox', { name: 'Discount' }),
        editor.getByRole<HTMLInputElement>('textbox', { name: 'Deposit' }),
        ...['totals-discount-row', 'totals-deposit-row'].map(id =>
          within(editor.getByTestId(id)).getByRole<HTMLButtonElement>('button', { name: '% → $' }),
        ),
      ]
      for (const control of controls()) expect(control.disabled).toBe(true)
      const serverTaxInput = taxInput()

      unmount = render(element, { container, hydrate: true }).unmount
      await waitFor(() => {
        for (const control of controls()) expect(control.disabled).toBe(false)
      })
      const tax = taxInput()
      expect(tax).toBe(serverTaxInput)
      expect(tax.value).toBe('')
      fireEvent.focus(tax)
      fireEvent.change(tax, { target: { value: '7.25' } })
      expect(tax.value).toBe('7.25')
      fireEvent.blur(tax)
      expect(tax.value).toBe('7.25')
      expect(onAction).toHaveBeenCalledExactlyOnceWith({ type: 'UPDATE_TAX_RATE', tax_rate: 0.0725 })
    } finally {
      unmount?.()
      container.remove()
    }
  })

  it('lays every adjustable row out as label | control | amount on one grid', () => {
    renderEdit(makeData({
      discount_type: 'percentage', discount_value: 10, discount_amount: 150,
      deposit_type: 'percent', deposit_value: 30, deposit: 487.13, balance_due: 1136.62,
    }))
    for (const id of ['totals-discount-row', 'totals-tax-row', 'totals-deposit-row']) {
      const row = screen.getByTestId(id)
      expect(row.className).toContain('grid-cols-[minmax(0,1fr)_6.5rem_minmax(5.5rem,auto)]')
      // label, control (an input inside), amount; the amount is never inside the control
      expect(row.children[1].querySelector('input')).toBeTruthy()
      expect(row.children[1].contains(row.children[2])).toBe(false)
    }
    expect(screen.getByTestId('totals-discount-row').children[2].textContent).toBe('-$150.00')
    expect(screen.getByTestId('totals-tax-row').children[2].textContent).toBe('$123.75')
  })

  it('shows Discount and Deposit as links until they are used', () => {
    renderEdit(makeData())
    expect(screen.queryByTestId('totals-discount-row')).toBeNull()
    expect(screen.queryByTestId('totals-deposit-row')).toBeNull()
    expect(screen.queryByTestId('totals-payment-box')).toBeNull()
    expect(screen.getByRole('button', { name: 'Discount' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Deposit' })).toBeTruthy()
  })

  it('"+ Discount" starts a percentage discount; "+ Deposit" a percent deposit', () => {
    const dispatch = renderEdit(makeData())
    fireEvent.click(screen.getByRole('button', { name: 'Discount' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_DISCOUNT', discount_type: 'percentage', discount_value: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_DEPOSIT', deposit_type: 'percent', deposit_value: 0 })
  })

  it('switches the discount unit with the % / $ toggle, keeping the value', () => {
    const dispatch = renderEdit(makeData({ discount_type: 'percentage', discount_value: 10, discount_amount: 150 }))
    fireEvent.click(screen.getByRole('button', { name: '% → $' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_DISCOUNT', discount_type: 'fixed', discount_value: 10 })
  })

  it('clearing the discount value removes the discount (back to the link)', () => {
    const dispatch = renderEdit(makeData({ discount_type: 'percentage', discount_value: 10, discount_amount: 150 }))
    const input = screen.getByRole('textbox', { name: 'Discount' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'UPDATE_DISCOUNT', discount_type: null, discount_value: 0 })
  })

  it('a value typed in keeps the discount and updates it', () => {
    const dispatch = renderEdit(makeData({ discount_type: 'percentage', discount_value: 0, discount_amount: 0 }))
    const input = screen.getByRole('textbox', { name: 'Discount' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '12,5' } })
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'UPDATE_DISCOUNT', discount_type: 'percentage', discount_value: 12.5 })
  })

  it('puts deposit and balance due in a Payment box', () => {
    renderEdit(makeData({ deposit_type: 'amount', deposit_value: 500, deposit: 500, balance_due: 1123.75 }))
    const box = screen.getByTestId('totals-payment-box')
    expect(box.textContent).toContain('Payment')
    expect(box.textContent).toContain('$500.00')
    expect(box.textContent).toContain('Balance Due')
    expect(box.textContent).toContain('$1,123.75')
  })

  it('shows the tax Default caption when the rate matches the company default', () => {
    renderEdit(makeData({ tax_rate: 0.0825 }), 0.0825)
    expect(screen.getByTestId('totals-tax-row').textContent).toContain('Default')
  })

  it('Reset to default restores the company tax rate', () => {
    const dispatch = renderEdit(makeData({ tax_rate: 0.05, tax_amount: 75 }), 0.0825)
    fireEvent.click(screen.getByRole('button', { name: /Reset to default/ }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_TAX_RATE', tax_rate: 0.0825 })
  })

  it('never renders the discount amount in the error color', () => {
    renderEdit(makeData({ discount_type: 'fixed', discount_value: 100, discount_amount: 100 }))
    expect(totals().querySelector('.text-destructive')).toBeNull()
  })
})
