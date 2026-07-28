import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEstimateReducer } from '@/components/workspace/estimate/use-estimate-reducer'
import type { EstimateWithSections } from '@/lib/queries/estimate'

// Phase 185 Plan 04 (PGMODE-03) — proves structuralEditEpoch bumps ONLY on
// the documented STRUCTURAL action types (this plan's <interfaces>
// classification table), and NEVER on pure text edits or MARK_SAVED/INIT.
// usePaginatedPreview (tests/unit/estimate/use-paginated-preview.test.ts)
// reads this counter to decide immediate-vs-debounced repagination — this
// file is the reducer-level half of that proof.
//
// REQUIRED READING for reviewers: this plan's own <interfaces> block and
// tests/unit/workspace/estimate-reducer-mark-saved.test.ts (the sibling
// SAVE-04/editEpoch coverage this file mirrors conventions from).

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function buildEstimate(overrides: Record<string, unknown> = {}): EstimateWithSections {
  const base = {
    id: 'est-1',
    project_id: 'proj-1',
    company_id: 'company-1',
    currency_code: 'USD',
    version: 1,
    estimate_seq: 1,
    estimate_number: null,
    estimate_date: null,
    is_current: true,
    share_token: 'tok',
    public_slug_token: null,
    status: 'draft',
    language: 'en' as const,
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    subtotal: 1500,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0.1,
    tax_amount: 0,
    total: 1500,
    deposit_type: 'none' as const,
    deposit_value: null,
    balance_due: null,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    client_response: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    presentation_settings: null,
    attachedPhotos: [],
    hasSignature: false,
    sections: [
      {
        id: 'temp-sec-1',
        estimate_id: 'est-1',
        company_id: 'company-1',
        title: 'General',
        sort_order: 0,
        subtotal: 1500,
        items: [
          {
            id: 'temp-item-1',
            section_id: 'temp-sec-1',
            company_id: 'company-1',
            description: 'Labor',
            quantity: 10,
            unit: 'hr',
            unit_price: 100,
            total: 1000,
            sort_order: 0,
            price_source: null,
            taxable: true,
          },
          {
            id: 'item-2',
            section_id: 'temp-sec-1',
            company_id: 'company-1',
            description: 'Materials',
            quantity: 1,
            unit: 'ea',
            unit_price: 500,
            total: 500,
            sort_order: 1,
            price_source: null,
            taxable: false,
          },
        ],
      },
    ],
  }
  return { ...base, ...overrides } as unknown as EstimateWithSections
}

// ---------------------------------------------------------------------------
// INIT — always resets to 0
// ---------------------------------------------------------------------------

describe('structuralEditEpoch — INIT', () => {
  it('starts at 0 for a fresh document load', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))
    expect(result.current[0].structuralEditEpoch).toBe(0)
  })

  it('resets to 0 on a later INIT dispatch', () => {
    const estimate = buildEstimate()
    const { result } = renderHook(() => useEstimateReducer(estimate))

    act(() => {
      result.current[1]({ type: 'ADD_ITEM', sectionId: 'temp-sec-1' })
    })
    expect(result.current[0].structuralEditEpoch).toBe(1)

    act(() => {
      result.current[1]({ type: 'INIT', estimate })
    })
    expect(result.current[0].structuralEditEpoch).toBe(0)
  })

  it('starts at 0 with a null initial estimate (blank draft)', () => {
    const { result } = renderHook(() => useEstimateReducer(null))
    expect(result.current[0].structuralEditEpoch).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// STRUCTURAL actions — bump by exactly 1, and also bump isDirty/editEpoch
// (via structuralDirty(), except ATTACH_PHOTO/DETACH_PHOTO — covered below)
// ---------------------------------------------------------------------------

describe('structuralEditEpoch — STRUCTURAL actions bump it by exactly 1 (and also set isDirty/editEpoch)', () => {
  const cases: Array<{ name: string; action: (sectionId: string, itemId: string) => unknown }> = [
    { name: 'ADD_ITEM', action: (sectionId) => ({ type: 'ADD_ITEM', sectionId }) },
    {
      name: 'REMOVE_ITEM',
      action: (sectionId, itemId) => ({ type: 'REMOVE_ITEM', sectionId, itemId }),
    },
    { name: 'ADD_SECTION', action: () => ({ type: 'ADD_SECTION' }) },
    { name: 'REMOVE_SECTION', action: (sectionId) => ({ type: 'REMOVE_SECTION', sectionId }) },
    {
      name: 'REORDER_ITEMS',
      action: (sectionId, itemId) => ({
        type: 'REORDER_ITEMS',
        sectionId,
        itemIds: [itemId, 'item-2'],
      }),
    },
    {
      name: 'REORDER_SECTIONS',
      action: (sectionId) => ({ type: 'REORDER_SECTIONS', sectionIds: [sectionId] }),
    },
    {
      name: 'UPDATE_DISCOUNT',
      action: () => ({ type: 'UPDATE_DISCOUNT', discount_type: 'fixed', discount_value: 10 }),
    },
    {
      name: 'UPDATE_DEPOSIT',
      action: () => ({ type: 'UPDATE_DEPOSIT', deposit_type: 'amount', deposit_value: 10 }),
    },
    { name: 'UPDATE_TAX_RATE', action: () => ({ type: 'UPDATE_TAX_RATE', tax_rate: 0.05 }) },
    {
      name: 'UPDATE_PRESENTATION_SETTINGS',
      action: () => ({ type: 'UPDATE_PRESENTATION_SETTINGS', presentation_settings: {} }),
    },
    {
      name: 'APPLY_REFINEMENT',
      action: () => ({
        type: 'APPLY_REFINEMENT',
        refined: {
          summary: 'Refined summary',
          sections: [
            {
              title: 'Refined section',
              items: [{ description: 'Refined item', quantity: 1, unit_price: 10, price_source: 'ai_estimate' }],
            },
          ],
        },
      }),
    },
    {
      name: 'APPLY_PRICE_BOOK_ITEM',
      action: (sectionId, itemId) => ({
        type: 'APPLY_PRICE_BOOK_ITEM',
        sectionId,
        itemId,
        item: { name: 'Price book item', unit: 'ea', unit_price: 42 },
      }),
    },
  ]

  it.each(cases)('$name bumps structuralEditEpoch by exactly 1 (and isDirty/editEpoch too)', ({ action }) => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))
    const before = result.current[0].structuralEditEpoch
    expect(before).toBe(0)

    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result.current[1](action('temp-sec-1', 'temp-item-1') as any)
    })

    expect(result.current[0].structuralEditEpoch).toBe(before + 1)
    expect(result.current[0].isDirty).toBe(true)
    expect(result.current[0].editEpoch).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// ATTACH_PHOTO / DETACH_PHOTO — bump structuralEditEpoch ONLY (no isDirty/editEpoch)
// ---------------------------------------------------------------------------

describe('structuralEditEpoch — ATTACH_PHOTO/DETACH_PHOTO bump it WITHOUT touching isDirty/editEpoch', () => {
  it('ATTACH_PHOTO bumps structuralEditEpoch but leaves isDirty/editEpoch untouched', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({
        type: 'ATTACH_PHOTO',
        photo: { id: 'photo-1', storage_path: 'co-1/photo-1.jpg', caption: null } as never,
      })
    })

    expect(result.current[0].structuralEditEpoch).toBe(1)
    expect(result.current[0].isDirty).toBe(false)
    expect(result.current[0].editEpoch).toBe(0)
    expect(result.current[0].attachedPhotos).toHaveLength(1)
  })

  it('DETACH_PHOTO bumps structuralEditEpoch but leaves isDirty/editEpoch untouched', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({
        type: 'ATTACH_PHOTO',
        photo: { id: 'photo-1', storage_path: 'co-1/photo-1.jpg', caption: null } as never,
      })
    })
    expect(result.current[0].structuralEditEpoch).toBe(1)

    act(() => {
      result.current[1]({ type: 'DETACH_PHOTO', photoId: 'photo-1' })
    })

    expect(result.current[0].structuralEditEpoch).toBe(2)
    expect(result.current[0].isDirty).toBe(false)
    expect(result.current[0].editEpoch).toBe(0)
    expect(result.current[0].attachedPhotos).toHaveLength(0)
  })

  it('re-attaching an already-attached photo id is a no-op (no bump)', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))
    const photo = { id: 'photo-1', storage_path: 'co-1/photo-1.jpg', caption: null } as never

    act(() => {
      result.current[1]({ type: 'ATTACH_PHOTO', photo })
    })
    expect(result.current[0].structuralEditEpoch).toBe(1)

    act(() => {
      result.current[1]({ type: 'ATTACH_PHOTO', photo })
    })
    expect(result.current[0].structuralEditEpoch).toBe(1)
    expect(result.current[0].attachedPhotos).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// TEXT-ONLY actions — NEVER bump structuralEditEpoch
// ---------------------------------------------------------------------------

describe('structuralEditEpoch — TEXT-ONLY actions never bump it', () => {
  it('UPDATE_FIELD leaves structuralEditEpoch unchanged (still bumps isDirty/editEpoch)', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({ type: 'UPDATE_FIELD', field: 'notes', value: 'hello' })
    })

    expect(result.current[0].structuralEditEpoch).toBe(0)
    expect(result.current[0].isDirty).toBe(true)
    expect(result.current[0].editEpoch).toBe(1)
  })

  it('UPDATE_SECTION_TITLE leaves structuralEditEpoch unchanged', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({ type: 'UPDATE_SECTION_TITLE', sectionId: 'temp-sec-1', title: 'Renamed' })
    })

    expect(result.current[0].structuralEditEpoch).toBe(0)
    expect(result.current[0].isDirty).toBe(true)
  })

  it('UPDATE_ITEM leaves structuralEditEpoch unchanged', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({
        type: 'UPDATE_ITEM',
        sectionId: 'temp-sec-1',
        itemId: 'temp-item-1',
        field: 'quantity',
        value: 5,
      })
    })

    expect(result.current[0].structuralEditEpoch).toBe(0)
    expect(result.current[0].isDirty).toBe(true)
  })

  it('MARK_SAVED never bumps structuralEditEpoch', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({ type: 'ADD_ITEM', sectionId: 'temp-sec-1' })
    })
    expect(result.current[0].structuralEditEpoch).toBe(1)

    act(() => {
      result.current[1]({ type: 'MARK_SAVED', updated_at: '2026-01-02T00:00:00.000Z' })
    })
    expect(result.current[0].structuralEditEpoch).toBe(1)
  })
})
