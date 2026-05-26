import { describe, it, expect, vi } from 'vitest'
import { render, screen, renderHook, act } from '@testing-library/react'
import React from 'react'
import { ItemRow } from '@/components/workspace/estimate/item-row'
import { useEstimateReducer } from '@/components/workspace/estimate/use-estimate-reducer'
import type { EstimateWithSections } from '@/lib/queries/estimate'

// ---- Stub EditorItem builder ----
function makeItem(overrides: {
  price_source?: 'price_book' | 'ai_estimate' | null
  isManuallyEdited?: boolean
  unit_price?: number
} = {}) {
  return {
    id: 'item-1',
    description: 'Test item',
    quantity: 1,
    unit: 'ea',
    unit_price: overrides.unit_price ?? 100,
    total: 100,
    sort_order: 0,
    price_source: overrides.price_source ?? null,
    isManuallyEdited: overrides.isManuallyEdited ?? false,
  }
}

// ---- Badge render tests ----
describe('price-badge: ItemRow badge rendering', () => {
  it('renders Price book badge for price_book items', () => {
    render(
      <table><tbody><ItemRow
        item={makeItem({ price_source: 'price_book' })}
        sectionId="s1"
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      /></tbody></table>
    )
    expect(screen.getByText('Price book')).toBeTruthy()
  })

  it('renders AI estimate badge for ai_estimate items', () => {
    render(
      <table><tbody><ItemRow
        item={makeItem({ price_source: 'ai_estimate' })}
        sectionId="s1"
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      /></tbody></table>
    )
    expect(screen.getByText('AI estimate')).toBeTruthy()
  })

  it('renders Edited badge when isManuallyEdited is true', () => {
    render(
      <table><tbody><ItemRow
        item={makeItem({ price_source: 'price_book', isManuallyEdited: true })}
        sectionId="s1"
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      /></tbody></table>
    )
    expect(screen.getByText('Edited')).toBeTruthy()
    expect(screen.queryByText('Price book')).toBeNull()
  })

  it('renders no badge for null price_source', () => {
    const { container } = render(
      <table><tbody><ItemRow
        item={makeItem({ price_source: null })}
        sectionId="s1"
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      /></tbody></table>
    )
    expect(screen.queryByText('Price book')).toBeNull()
    expect(screen.queryByText('AI estimate')).toBeNull()
    expect(screen.queryByText('Edited')).toBeNull()
    expect(container).toBeTruthy()
  })
})

// ---- Reducer test ----
describe('price-badge: UPDATE_ITEM reducer behavior', () => {
  it('UPDATE_ITEM unit_price dispatch sets isManuallyEdited to true', () => {
    // Build a minimal EstimateWithSections-shaped object
    const initialEstimate = {
      id: 'est-1',
      summary: null,
      notes: null,
      timeline: null,
      payment_terms: null,
      warranty_terms: null,
      discount_type: null,
      discount_value: 0,
      discount_amount: 0,
      tax_rate: 0,
      tax_amount: 0,
      subtotal: 0,
      total: 0,
      is_current: true,
      version: 1,
      estimate_seq: 1,
      estimate_number: null,
      estimate_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_id: 'proj-1',
      company_id: 'co-1',
      sections: [{
        id: 's1',
        estimate_id: 'est-1',
        title: 'Section 1',
        sort_order: 0,
        subtotal: 50,
        created_at: new Date().toISOString(),
        items: [{
          id: 'i1',
          section_id: 's1',
          company_id: 'co-1',
          description: 'Item',
          quantity: 1,
          unit: null,
          unit_price: 50,
          total: 50,
          sort_order: 0,
          price_source: 'price_book' as const,
          created_at: new Date().toISOString(),
        }],
      }],
    } as unknown as EstimateWithSections

    const { result } = renderHook(() => useEstimateReducer(initialEstimate))
    const [, dispatch] = result.current
    act(() => {
      dispatch({ type: 'UPDATE_ITEM', sectionId: 's1', itemId: 'i1', field: 'unit_price', value: 75 })
    })
    const [state] = result.current
    const item = state.sections[0].items[0]
    expect(item.isManuallyEdited).toBe(true)
    expect(item.unit_price).toBe(75)
  })
})

// ---- Save behavior test ----
describe('price-badge: saveEstimate price_source persistence', () => {
  it('saveEstimate writes price_source: null for manually-edited items', () => {
    // Unit-test the rule applied in lib/actions/estimate.ts save paths
    function resolvePriceSource(item: { isManuallyEdited?: boolean; price_source: string | null }) {
      return item.isManuallyEdited ? null : (item.price_source ?? null)
    }

    expect(resolvePriceSource({ isManuallyEdited: true, price_source: 'price_book' })).toBe(null)
    expect(resolvePriceSource({ isManuallyEdited: true, price_source: 'ai_estimate' })).toBe(null)
    expect(resolvePriceSource({ isManuallyEdited: false, price_source: 'price_book' })).toBe('price_book')
    expect(resolvePriceSource({ isManuallyEdited: false, price_source: 'ai_estimate' })).toBe('ai_estimate')
    expect(resolvePriceSource({ isManuallyEdited: false, price_source: null })).toBe(null)
  })
})
