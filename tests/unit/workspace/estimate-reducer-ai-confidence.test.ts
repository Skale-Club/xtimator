import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEstimateReducer } from '@/components/workspace/estimate/use-estimate-reducer'
import type { EstimateWithSections } from '@/lib/queries/estimate'

// SEED-057 G: the AI confidence belongs to the AI's line. The reducer carries it from the
// loaded row and drops it as soon as the owner changes what the line is or how much of it there is.

function estimate(): EstimateWithSections {
  return {
    id: 'e', project_id: 'p', company_id: 'c', currency_code: 'USD', version: 1, estimate_seq: 1,
    estimate_number: null, estimate_date: null, is_current: true, share_token: 't', public_slug_token: null,
    status: 'draft', language: 'en', summary: null, notes: null, timeline: null, payment_terms: null,
    warranty_terms: null, subtotal: 100, discount_type: null, discount_value: 0, discount_amount: 0,
    tax_rate: 0, tax_amount: 0, total: 100, deposit_type: 'none', deposit_value: null, balance_due: null,
    sent_at: null, viewed_at: null, responded_at: null, client_response: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    presentation_settings: null, attachedPhotos: [], hasSignature: false,
    sections: [
      {
        id: 's', estimate_id: 'e', company_id: 'c', title: 'T', sort_order: 0, subtotal: 100,
        items: [
          { id: 'i', section_id: 's', company_id: 'c', description: 'Paint walls', quantity: 10, unit: 'sq ft',
            unit_price: 10, total: 100, sort_order: 0, price_source: 'ai_estimate', confidence: 'low', basis: 'guessed' },
        ],
      },
    ],
  } as unknown as EstimateWithSections
}

const item = (r: [{ sections: Array<{ items: Array<Record<string, unknown>> }> }, unknown]) =>
  r[0].sections[0].items[0]

describe('AI confidence in the editor reducer', () => {
  it('is loaded from the row', () => {
    const { result } = renderHook(() => useEstimateReducer(estimate()))
    expect(item(result.current as never)).toMatchObject({ confidence: 'low', basis: 'guessed' })
  })

  it.each([
    ['description', 'Paint all walls'],
    ['quantity', 12],
    ['unit', 'job'],
    ['unit_price', 11],
  ])('is dropped when the owner edits %s', (field, value) => {
    const { result } = renderHook(() => useEstimateReducer(estimate()))
    act(() => result.current[1]({ type: 'UPDATE_ITEM', sectionId: 's', itemId: 'i', field, value } as never))
    expect(item(result.current as never)).toMatchObject({ confidence: null, basis: null })
  })

  it('survives edits that do not change the line itself (discount, taxable)', () => {
    const { result } = renderHook(() => useEstimateReducer(estimate()))
    act(() => result.current[1]({ type: 'UPDATE_ITEM', sectionId: 's', itemId: 'i', field: 'taxable', value: false } as never))
    expect(item(result.current as never)).toMatchObject({ confidence: 'low' })
  })
})
