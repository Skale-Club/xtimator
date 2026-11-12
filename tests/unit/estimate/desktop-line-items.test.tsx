import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import {
  EstimateDocument,
  type EstimateDocumentData,
} from '@/components/workspace/estimate/estimate-document'

// Phase 3 of the line-item redesign (desktop editor): the description wraps
// instead of being cut, the Tax column shows only when the estimate charges
// tax, Enter in a number field moves to the next line (adding one after the
// last), and the row menu offers Details (the shared item editor as a side
// drawer) and Duplicate.

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
    discount_type: null, discount_value: 0, discount_amount: 0, tax_rate: 0, tax_amount: 0,
    subtotal: 300, total: 300, deposit_type: 'none', deposit_value: null, deposit: 0, balance_due: 300,
    currency_code: 'USD',
    sections: [{ id: 's1', title: 'Main', subtotal: 300, items: [
      { id: 'a', description: 'First line', quantity: 1, unit: 'each', unit_price: 100, total: 100 },
      { id: 'b', description: 'Second line', quantity: 2, unit: 'each', unit_price: 100, total: 200 },
    ] }],
    estimate_date: '2026-11-06', estimate_number: '0001', presentation_settings: null,
    ...overrides,
  }
}

function renderEdit(data: EstimateDocumentData, dispatch = vi.fn()) {
  render(
    <EstimateDocument
      mode="edit"
      data={data}
      dispatch={dispatch}
      projectName="P"
      projectType={null}
      estimateVersion={1}
      estimateSeq={1}
      estimateCreatedAt="2026-11-06T00:00:00Z"
      projectId="p1"
    />,
  )
  return dispatch
}

const headerLabels = () =>
  Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent?.trim())

describe('desktop line items', () => {
  it('hides the Tax column when the estimate charges no tax', () => {
    renderEdit(makeData())
    expect(headerLabels()).not.toContain('Tax')
    expect(document.querySelector('tbody [role="switch"]')).toBeNull()
  })

  it('shows the Tax column when the estimate charges tax', () => {
    renderEdit(makeData({ tax_rate: 8.25, tax_amount: 24.75 }))
    expect(headerLabels()).toContain('Tax')
    expect(document.querySelectorAll('tbody [role="switch"]').length).toBe(2)
  })

  it('renders the description as a wrapping field, not a one-line input', () => {
    renderEdit(makeData())
    const desc = document.querySelector('tr[data-item-id="a"] [data-desc-cell] textarea')
    expect(desc).toBeTruthy()
    expect((desc as HTMLTextAreaElement).value).toBe('First line')
  })

  it('Enter in the last line adds a new line in the section', () => {
    vi.useFakeTimers()
    const dispatch = renderEdit(makeData())
    const qty = document.querySelector('tr[data-item-id="b"] input[type="number"]') as HTMLInputElement
    fireEvent.keyDown(qty, { key: 'Enter' })
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_ITEM', sectionId: 's1', itemId: expect.stringMatching(/^temp-/) }),
    )
    act(() => vi.runAllTimers())
    vi.useRealTimers()
  })

  it('Enter on an earlier line moves to the next description without adding one', () => {
    vi.useFakeTimers()
    const dispatch = renderEdit(makeData())
    const qty = document.querySelector('tr[data-item-id="a"] input[type="number"]') as HTMLInputElement
    fireEvent.keyDown(qty, { key: 'Enter' })
    act(() => vi.runAllTimers())
    vi.useRealTimers()
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_ITEM' }))
    expect(document.activeElement).toBe(
      document.querySelector('tr[data-item-id="b"] [data-desc-cell] textarea'),
    )
  })

  it('the row menu duplicates a line right after itself', async () => {
    const dispatch = renderEdit(makeData())
    const kebab = document.querySelector('tr[data-item-id="a"] button[aria-label]') as HTMLElement
    fireEvent.pointerDown(kebab, { button: 0, pointerType: 'mouse' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'INSERT_ITEM',
        sectionId: 's1',
        index: 1,
        item: expect.objectContaining({ description: 'First line' }),
      }),
    )
  })

  it('Details opens the shared item editor', async () => {
    renderEdit(makeData())
    const kebab = document.querySelector('tr[data-item-id="b"] button[aria-label]') as HTMLElement
    fireEvent.pointerDown(kebab, { button: 0, pointerType: 'mouse' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Details' }))
    const sheet = await screen.findByTestId('item-editor-sheet')
    expect(sheet.textContent).toContain('Edit item')
  })
})
