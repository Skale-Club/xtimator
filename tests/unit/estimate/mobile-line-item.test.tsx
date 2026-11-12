import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import type { DocumentItem } from '@/lib/estimate/document/model'
import { ItemSummaryRow, formatItemQuantityLine } from '@/components/workspace/estimate/item-card-mobile'
import { ItemEditorSheet } from '@/components/workspace/estimate/item-editor-sheet'
import { useEstimateReducer } from '@/components/workspace/estimate/use-estimate-reducer'
import type { EstimateWithSections } from '@/lib/queries/estimate'

// Mobile line items (Phase 1 of the line-item redesign, 2026-11-12): the list
// shows a read summary per item, and one item at a time is edited in a bottom
// sheet. Competitors (Jobber, Joist, Square, JobNimbus) all work this way on a
// phone; the old card folded the desktop table into four lines of inputs.

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

function makeItem(overrides: Partial<DocumentItem> = {}): DocumentItem {
  return {
    id: 'item-1',
    description: 'Recurring home cleaning',
    quantity: 2,
    unit: 'visit',
    unit_price: 90,
    total: 180,
    taxable: true,
    discount: 0,
    ...overrides,
  }
}

describe('ItemSummaryRow', () => {
  it('shows description, "qty unit × price" and the line total, with no inputs', () => {
    const { container } = render(<ItemSummaryRow item={makeItem()} onOpen={vi.fn()} />)
    expect(container.textContent).toContain('Recurring home cleaning')
    expect(container.textContent).toContain('2 visit × $90.00')
    expect(container.textContent).toContain('$180.00')
    expect(container.querySelector('input, textarea, select, [role="switch"]')).toBeNull()
  })

  it('opens the editor on tap', () => {
    const onOpen = vi.fn()
    render(<ItemSummaryRow item={makeItem()} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /Edit item: Recurring home cleaning/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('tags only what differs from the default: no tax, line discount', () => {
    const plain = render(<ItemSummaryRow item={makeItem()} />)
    expect(plain.container.textContent).not.toContain('No tax')
    expect(plain.container.textContent).not.toContain('Discount')
    plain.unmount()

    const { container } = render(
      <ItemSummaryRow item={makeItem({ taxable: false, discount: 20, total: 160 })} />,
    )
    expect(container.textContent).toContain('No tax')
    expect(container.textContent).toContain('Discount −$20.00')
  })

  it('names an empty line "New item" instead of showing a blank row', () => {
    const { container } = render(<ItemSummaryRow item={makeItem({ description: '' })} />)
    expect(container.textContent).toContain('New item')
  })

  it('formats fractional quantities without float noise', () => {
    expect(formatItemQuantityLine(makeItem({ quantity: 146.5, unit: 'sq ft', unit_price: 2 }), 'USD')).toBe(
      '146.5 sq ft × $2.00',
    )
    expect(formatItemQuantityLine(makeItem({ quantity: 0.1 + 0.2, unit: null, unit_price: 1 }), 'USD')).toBe(
      '0.3 × $1.00',
    )
  })
})

function renderSheet(overrides: Partial<React.ComponentProps<typeof ItemEditorSheet>> = {}) {
  const props = {
    item: makeItem(),
    onClose: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    ...overrides,
  }
  render(<ItemEditorSheet {...props} />)
  return props
}

describe('ItemEditorSheet', () => {
  it('renders nothing while no item is open', () => {
    renderSheet({ item: null })
    expect(screen.queryByTestId('item-editor-sheet')).toBeNull()
  })

  it('steps the quantity with − and +', () => {
    const { onUpdate } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
    expect(onUpdate).toHaveBeenLastCalledWith('quantity', 3)
    fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }))
    expect(onUpdate).toHaveBeenLastCalledWith('quantity', 1)
  })

  it('never steps below zero', () => {
    renderSheet({ item: makeItem({ quantity: 0 }) })
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toHaveProperty('disabled', true)
  })

  it('picks a unit from the chips and shows the current one selected', () => {
    const { onUpdate } = renderSheet({ item: makeItem({ unit: 'each' }), unitOptions: ['each', 'hour', 'day'] })
    expect(screen.getByRole('radio', { name: 'each' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'hour' }))
    expect(onUpdate).toHaveBeenLastCalledWith('unit', 'hour')
  })

  it('keeps a custom unit visible as its own chip', () => {
    renderSheet({ item: makeItem({ unit: 'visit' }), unitOptions: ['visit', 'each', 'hour'] })
    expect(screen.getByRole('radio', { name: 'visit' }).getAttribute('aria-checked')).toBe('true')
  })

  it('shows the live line total', () => {
    renderSheet({ item: makeItem({ total: 360 }) })
    expect(screen.getByTestId('item-editor-total').textContent).toBe('$360.00')
  })

  it('keeps tax and discount under More options', () => {
    renderSheet()
    expect(screen.queryByText('Charge tax')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.getByText('Charge tax')).toBeTruthy()
  })

  it('opens More options by itself when the item already skips tax', () => {
    renderSheet({ item: makeItem({ taxable: false }) })
    expect(screen.getByText('Charge tax')).toBeTruthy()
  })

  it('toggles tax for the line', () => {
    const { onUpdate } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Charge tax' }))
    expect(onUpdate).toHaveBeenLastCalledWith('taxable', false)
  })

  it('Delete, Duplicate and Done call their handlers', () => {
    const props = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(props.onDuplicate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(props.onDelete).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('a new line offers Add another (once it has a description) instead of Duplicate', () => {
    const onAddAnother = vi.fn()
    renderSheet({ isNew: true, item: makeItem({ description: '' }), onAddAnother })
    expect(screen.queryByRole('button', { name: 'Duplicate' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add another' })).toHaveProperty('disabled', true)
  })

  it('Add another calls its handler when the line has a description', () => {
    const onAddAnother = vi.fn()
    renderSheet({ isNew: true, onAddAnother })
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }))
    expect(onAddAnother).toHaveBeenCalledTimes(1)
  })

  it('titles a just-added line "New item"', () => {
    renderSheet({ isNew: true, item: makeItem({ description: '' }) })
    expect(screen.getByText('New item')).toBeTruthy()
  })
})

function buildEstimate(): EstimateWithSections {
  return {
    id: 'est-1', project_id: 'proj-1', company_id: 'company-1', currency_code: 'USD', version: 1,
    estimate_seq: 1, estimate_number: null, estimate_date: null, is_current: true, share_token: 'tok',
    public_slug_token: null, status: 'draft', language: 'en', summary: null, notes: null, timeline: null,
    payment_terms: null, warranty_terms: null, subtotal: 300, discount_type: null, discount_value: 0,
    discount_amount: 0, tax_rate: 0, tax_amount: 0, total: 300, deposit_type: 'none', deposit_value: null,
    balance_due: null, sent_at: null, viewed_at: null, responded_at: null, client_response: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    presentation_settings: null, attachedPhotos: [], hasSignature: false,
    sections: [{
      id: 'sec-1', estimate_id: 'est-1', company_id: 'company-1', title: 'General', sort_order: 0, subtotal: 300,
      items: [
        { id: 'a', section_id: 'sec-1', company_id: 'company-1', description: 'A', quantity: 1, unit: 'ea', unit_price: 100, total: 100, sort_order: 0, price_source: null, taxable: true },
        { id: 'b', section_id: 'sec-1', company_id: 'company-1', description: 'B', quantity: 2, unit: 'ea', unit_price: 100, total: 200, sort_order: 1, price_source: null, taxable: true },
      ],
    }],
  } as unknown as EstimateWithSections
}

describe('INSERT_ITEM (Duplicate, Undo after Delete)', () => {
  it('inserts a copy at the index with a fresh temp- id, renumbers and re-totals', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))
    const source = result.current[0].sections[0].items[0]
    act(() => {
      result.current[1]({ type: 'INSERT_ITEM', sectionId: 'sec-1', index: 1, item: source })
    })
    const items = result.current[0].sections[0].items
    expect(items.map((i) => i.description)).toEqual(['A', 'A', 'B'])
    expect(items[1].id).toMatch(/^temp-/)
    expect(items[1].id).not.toBe(source.id)
    expect(items.map((i) => i.sort_order)).toEqual([0, 1, 2])
    expect(result.current[0].sections[0].subtotal).toBe(400)
    expect(result.current[0].isDirty).toBe(true)
  })

  it('restores a deleted line at its old position as a NEW row (never reuses the saved id)', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))
    const removed = result.current[0].sections[0].items[0]
    act(() => {
      result.current[1]({ type: 'REMOVE_ITEM', sectionId: 'sec-1', itemId: 'a' })
    })
    act(() => {
      result.current[1]({ type: 'INSERT_ITEM', sectionId: 'sec-1', index: 0, item: removed })
    })
    const items = result.current[0].sections[0].items
    expect(items.map((i) => i.description)).toEqual(['A', 'B'])
    expect(items[0].id).not.toBe('a')
  })

  it('clamps an out-of-range index to the end', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))
    const source = result.current[0].sections[0].items[0]
    act(() => {
      result.current[1]({ type: 'INSERT_ITEM', sectionId: 'sec-1', index: 99, item: source })
    })
    expect(result.current[0].sections[0].items.map((i) => i.description)).toEqual(['A', 'B', 'A'])
  })
})
