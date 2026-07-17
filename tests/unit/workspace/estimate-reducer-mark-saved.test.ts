import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEstimateReducer } from '@/components/workspace/estimate/use-estimate-reducer'
import type { EstimateWithSections } from '@/lib/queries/estimate'

// Phase 165 Plan 02 — closes the client half of audit § B:
//   SAVE-03 (temp-id remap on MARK_SAVED, kills the churn in audit B5)
//   SAVE-04 (dirty-epoch, kills the false-clean in audit B4)
//   SAVE-07 (client preview parity: server-total adoption + flat-path taxable)
//
// REQUIRED READING for reviewers: .planning/audits/v4.19-ESTIMATE-DEEP-AUDIT.md § B
// and .planning/phases/165-atomic-save-version-authority/165-01-SUMMARY.md.

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
// (a)+(b): MARK_SAVED remap + totals adoption
// ---------------------------------------------------------------------------

describe('MARK_SAVED — SAVE-03 id remap + SAVE-07 totals adoption', () => {
  it('remaps a temp- section and item id to the server-assigned real id', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({
        type: 'MARK_SAVED',
        updated_at: '2026-01-02T00:00:00.000Z',
        idMap: { 'temp-sec-1': 'real-sec-1', 'temp-item-1': 'real-item-1' },
      })
    })

    const [state] = result.current
    expect(state.sections[0].id).toBe('real-sec-1')
    expect(state.sections[0].items[0].id).toBe('real-item-1')
    // The already-real item id is left untouched.
    expect(state.sections[0].items[1].id).toBe('item-2')
  })

  it('an absent/empty idMap skips the remap entirely (presentation re-baseline path)', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({ type: 'MARK_SAVED', updated_at: '2026-01-02T00:00:00.000Z' })
    })

    const [state] = result.current
    expect(state.sections[0].id).toBe('temp-sec-1')
    expect(state.sections[0].items[0].id).toBe('temp-item-1')
  })

  it('adopts server-computed totals verbatim when present', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({
        type: 'MARK_SAVED',
        updated_at: '2026-01-02T00:00:00.000Z',
        totals: { subtotal: 1500, tax_amount: 87.5, discount_amount: 0, total: 1587.5, balance_due: 1587.5 },
      })
    })

    const [state] = result.current
    expect(state.subtotal).toBe(1500)
    expect(state.tax_amount).toBe(87.5)
    expect(state.discount_amount).toBe(0)
    expect(state.total).toBe(1587.5)
    expect(state.balance_due).toBe(1587.5)
  })

  it('an absent totals payload leaves current totals untouched (gear/presentation path never changes priced content)', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))
    const before = result.current[0]

    act(() => {
      result.current[1]({ type: 'MARK_SAVED', updated_at: '2026-01-02T00:00:00.000Z' })
    })

    const [state] = result.current
    expect(state.subtotal).toBe(before.subtotal)
    expect(state.total).toBe(before.total)
  })

  it('always adopts updated_at regardless of idMap/totals presence', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({ type: 'MARK_SAVED', updated_at: '2099-01-01T00:00:00.000Z' })
    })

    expect(result.current[0].updated_at).toBe('2099-01-01T00:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// (c): dirty-epoch (SAVE-04, kills audit B4 false-clean)
// ---------------------------------------------------------------------------

describe('MARK_SAVED — SAVE-04 dirty-epoch (audit B4 false-clean fix)', () => {
  it('an epoch MISMATCH (an edit landed mid-save) leaves isDirty true', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    // Simulate runSave capturing the epoch BEFORE the edit that lands mid-flight.
    const savedEpoch = result.current[0].editEpoch // 0

    act(() => {
      result.current[1]({ type: 'UPDATE_FIELD', field: 'notes', value: 'mid-save edit' })
    })
    expect(result.current[0].editEpoch).toBe(savedEpoch + 1)
    expect(result.current[0].isDirty).toBe(true)

    act(() => {
      result.current[1]({ type: 'MARK_SAVED', updated_at: '2026-01-02T00:00:00.000Z', savedEpoch })
    })

    // Stale savedEpoch (0) !== current editEpoch (1) -> stays dirty.
    expect(result.current[0].isDirty).toBe(true)
  })

  it('an epoch MATCH clears isDirty', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({ type: 'UPDATE_FIELD', field: 'notes', value: 'edit' })
    })
    const savedEpoch = result.current[0].editEpoch // 1, captured "before await" in the real flow
    expect(result.current[0].isDirty).toBe(true)

    act(() => {
      result.current[1]({ type: 'MARK_SAVED', updated_at: '2026-01-02T00:00:00.000Z', savedEpoch })
    })

    expect(result.current[0].isDirty).toBe(false)
  })

  it('MARK_SAVED with no savedEpoch (presentation re-baseline) clears isDirty regardless', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({ type: 'UPDATE_FIELD', field: 'notes', value: 'edit' })
    })
    expect(result.current[0].isDirty).toBe(true)

    act(() => {
      result.current[1]({ type: 'MARK_SAVED', updated_at: '2026-01-02T00:00:00.000Z' })
    })

    expect(result.current[0].isDirty).toBe(false)
  })

  it('MARK_SAVED/INIT never bump editEpoch themselves', () => {
    const estimate = buildEstimate()
    const { result } = renderHook(() => useEstimateReducer(estimate))
    const epoch0 = result.current[0].editEpoch

    act(() => {
      result.current[1]({ type: 'MARK_SAVED', updated_at: '2026-01-02T00:00:00.000Z' })
    })
    expect(result.current[0].editEpoch).toBe(epoch0)

    act(() => {
      result.current[1]({ type: 'INIT', estimate })
    })
    expect(result.current[0].editEpoch).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// (d): recalculate flat-tax honors taxable + mirrors server discount proration
// ---------------------------------------------------------------------------

describe('recalculate — SAVE-07 flat-path taxable + server-mirrored discount proration', () => {
  it('a taxable=false line reduces the previewed flat tax (no discount)', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      // tax_rate is already 0.1875... use a clean rate for the assertion.
      result.current[1]({ type: 'UPDATE_TAX_RATE', tax_rate: 0.0875 })
    })

    const [state] = result.current
    expect(state.subtotal).toBe(1500) // subtotal still includes the non-taxable line
    // Only the 1000 taxable (item-1) base is taxed: 1000 * 0.0875 = 87.5 (NOT 131.25).
    expect(state.tax_amount).toBe(87.5)
  })

  it('a mixed-taxable estimate with a global discount matches the server-prorated value (not negative)', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))

    act(() => {
      result.current[1]({ type: 'UPDATE_DISCOUNT', discount_type: 'fixed', discount_value: 150 })
    })
    act(() => {
      result.current[1]({ type: 'UPDATE_TAX_RATE', tax_rate: 0.1 })
    })

    // taxableBase = 1000 (only item-1), overall subtotal = 1500.
    // proratedDisc = 150 * (1000/1500) = 100.
    // tax_amount = (1000 - 100) * 0.1 = 90 — mirrors compute-totals.ts's flat
    // path exactly (see tests/unit/estimate/compute-totals-taxable-flat.test.ts).
    const [state] = result.current
    expect(state.discount_amount).toBe(150)
    expect(state.tax_amount).toBe(90)
    expect(state.tax_amount).toBeGreaterThanOrEqual(0)
  })

  it('all-taxable stays BYTE-IDENTICAL to the pre-165-02 flat formula', () => {
    const allTaxableEstimate = buildEstimate({
      sections: [
        {
          id: 'sec-1',
          estimate_id: 'est-1',
          company_id: 'company-1',
          title: 'General',
          sort_order: 0,
          subtotal: 1500,
          items: [
            {
              id: 'item-1',
              section_id: 'sec-1',
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
              section_id: 'sec-1',
              company_id: 'company-1',
              description: 'Materials',
              quantity: 1,
              unit: 'ea',
              unit_price: 500,
              total: 500,
              sort_order: 1,
              price_source: null,
              taxable: true,
            },
          ],
        },
      ],
    })
    const { result } = renderHook(() => useEstimateReducer(allTaxableEstimate))

    act(() => {
      result.current[1]({ type: 'UPDATE_DISCOUNT', discount_type: 'fixed', discount_value: 150 })
    })
    act(() => {
      result.current[1]({ type: 'UPDATE_TAX_RATE', tax_rate: 0.1 })
    })

    // Pre-165-02 formula: (subtotal - discount_amount) * tax_rate = (1500-150)*0.1 = 135.
    const [state] = result.current
    expect(state.subtotal).toBe(1500)
    expect(state.discount_amount).toBe(150)
    expect(state.tax_amount).toBe(135)
    expect(state.total).toBe(1500 - 150 + 135)
  })
})

// ---------------------------------------------------------------------------
// (e): every isDirty-setting action increments editEpoch
// ---------------------------------------------------------------------------

describe('editEpoch — every isDirty-setting action bumps it exactly once (Warning 3)', () => {
  const cases: Array<{ name: string; action: (sectionId: string, itemId: string) => unknown }> = [
    { name: 'UPDATE_FIELD', action: () => ({ type: 'UPDATE_FIELD', field: 'summary', value: 'hi' }) },
    {
      name: 'UPDATE_SECTION_TITLE',
      action: (sectionId) => ({ type: 'UPDATE_SECTION_TITLE', sectionId, title: 'New Title' }),
    },
    {
      name: 'UPDATE_ITEM',
      action: (sectionId, itemId) => ({
        type: 'UPDATE_ITEM',
        sectionId,
        itemId,
        field: 'quantity',
        value: 5,
      }),
    },
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

  it.each(cases)('$name increments editEpoch by exactly 1 and sets isDirty true', ({ action }) => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))
    const before = result.current[0].editEpoch
    expect(before).toBe(0)

    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result.current[1](action('temp-sec-1', 'temp-item-1') as any)
    })

    expect(result.current[0].editEpoch).toBe(before + 1)
    expect(result.current[0].isDirty).toBe(true)
  })

  it('MARK_SAVED and INIT never bump editEpoch (only the 15 dirty-setting actions do)', () => {
    const estimate = buildEstimate()
    const { result } = renderHook(() => useEstimateReducer(estimate))

    act(() => {
      result.current[1]({ type: 'MARK_SAVED', updated_at: '2026-01-02T00:00:00.000Z' })
    })
    expect(result.current[0].editEpoch).toBe(0)
  })
})
