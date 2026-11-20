// Review marks on the owner's editable estimate rows (notices review, stage 1):
// an unpriced line gets an amber bar + "+ Add price" slot, an AI price the owner
// has not confirmed gets a sparkle with Confirm / Adjust. Never in view mode.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, renderHook, act } from '@testing-library/react'
import React from 'react'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentCompany,
} from '@/components/workspace/estimate/estimate-document'
import { useEstimateReducer } from '@/components/workspace/estimate/use-estimate-reducer'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import {
  buildFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
} from './fixtures/document-fixtures'

afterEach(cleanup)

const company: DocumentCompany = FIXTURE_COMPANY as DocumentCompany

function buildData(patch?: (items: EstimateDocumentData['sections'][number]['items']) => void): EstimateDocumentData {
  const data = toFixtureDocumentData(buildFixtureEstimate({})) as unknown as EstimateDocumentData
  patch?.(data.sections[1].items)
  return data
}

function renderDoc(data: EstimateDocumentData, mode: 'edit' | 'view', dispatch = vi.fn()) {
  const utils = render(
    <EstimateDocument
      mode={mode}
      data={data}
      company={company}
      client={null}
      projectName="Test Project"
      projectType={null}
      estimateVersion={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
      dispatch={mode === 'edit' ? dispatch : undefined}
    />,
  )
  return { ...utils, dispatch }
}

const rowOf = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`tr[data-item-id="${id}"]`)!
const mobileOf = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-mobile-item-id="${id}"]`)!

const unpricedPatch = (items: EstimateDocumentData['sections'][number]['items']) => {
  items[0] = { ...items[0], unit_price: 0, total: 0 }
}
const aiPatch = (items: EstimateDocumentData['sections'][number]['items']) => {
  items[0] = { ...items[0], price_source: 'ai_estimate', confidence: 'low', basis: 'SECRET-BASIS' }
}

describe('unpriced line', () => {
  it('shows the amber bar and the "+ Add price" slot on that row only', () => {
    const data = buildData(unpricedPatch)
    const { container } = renderDoc(data, 'edit')
    const [first, second] = data.sections[1].items
    const row = rowOf(container, first.id)
    expect(row.querySelector('[data-testid="row-review-bar"]')).toBeTruthy()
    expect(row.querySelector('[data-testid="row-price-slot"]')?.textContent).toContain('Add price')
    const other = rowOf(container, second.id)
    expect(other.querySelector('[data-testid="row-review-bar"]')).toBeNull()
    expect(other.querySelector('[data-testid="row-price-slot"]')).toBeNull()
  })

  it('tapping the slot focuses the row price input', () => {
    const data = buildData(unpricedPatch)
    const { container } = renderDoc(data, 'edit')
    const row = rowOf(container, data.sections[1].items[0].id)
    expect(row.querySelector('input[data-money-input]')).toBeNull()
    fireEvent.click(row.querySelector('[data-testid="row-price-slot"]')!)
    const input = row.querySelector<HTMLInputElement>('input[data-money-input]')
    expect(input).toBeTruthy()
    expect(document.activeElement).toBe(input)
    expect(row.querySelector('[data-testid="row-price-slot"]')).toBeNull()
  })

  it('the phone list shows the bar and the compact "+ Price" slot', () => {
    const data = buildData(unpricedPatch)
    const { container } = renderDoc(data, 'edit')
    const m = mobileOf(container, data.sections[1].items[0].id)
    expect(m.querySelector('[data-testid="row-review-bar"]')).toBeTruthy()
    expect(m.querySelector('[data-testid="row-price-slot"]')?.textContent).toBe('+ Price')
    expect(mobileOf(container, data.sections[1].items[1].id).querySelector('[data-testid="row-review-bar"]')).toBeNull()
  })

  it('a fully priced document shows no marks at all', () => {
    const { container } = renderDoc(buildData(), 'edit')
    expect(container.querySelector('[data-testid="row-review-bar"]')).toBeNull()
    expect(container.querySelector('[data-testid="row-price-slot"]')).toBeNull()
    expect(container.querySelector('[data-testid="row-ai-price-mark"]')).toBeNull()
  })
})

describe('AI price to check', () => {
  it('only a low-confidence AI price still unconfirmed gets the mark', () => {
    const data = buildData((items) => {
      aiPatch(items)
      items[1] = { ...items[1], price_source: 'ai_estimate', confidence: 'high' }
    })
    const { container } = renderDoc(data, 'edit')
    const [a, b] = data.sections[1].items
    expect(rowOf(container, a.id).querySelector('[data-testid="row-ai-price-mark"]')).toBeTruthy()
    expect(rowOf(container, b.id).querySelector('[data-testid="row-ai-price-mark"]')).toBeNull()
    expect(container.querySelectorAll('tr [data-testid="row-ai-price-mark"]')).toHaveLength(1)
  })

  it('disappears once the owner confirmed or edited the line', () => {
    const data = buildData((items) => {
      aiPatch(items)
      items[0] = { ...items[0], isManuallyEdited: true }
    })
    const { container } = renderDoc(data, 'edit')
    expect(container.querySelector('[data-testid="row-ai-price-mark"]')).toBeNull()
  })

  it('is absent in view mode and never explains the price', () => {
    const { container } = renderDoc(buildData(aiPatch), 'view')
    expect(container.querySelector('[data-testid="row-ai-price-mark"]')).toBeNull()
    expect(container.textContent).not.toContain('SECRET-BASIS')
  })

  it('desktop popover: Confirm dispatches CONFIRM_ITEM_PRICE for that row', () => {
    const data = buildData(aiPatch)
    const { container, dispatch } = renderDoc(data, 'edit')
    const item = data.sections[1].items[0]
    fireEvent.click(rowOf(container, item.id).querySelector('[data-testid="row-ai-price-mark"]')!)
    expect(screen.getByTestId('row-ai-price-popover').textContent).toContain('Suggested by the AI.')
    expect(screen.getByTestId('row-ai-price-popover').textContent).not.toContain('SECRET-BASIS')
    fireEvent.click(screen.getByTestId('row-ai-price-confirm'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CONFIRM_ITEM_PRICE',
      sectionId: data.sections[1].id,
      itemId: item.id,
    })
  })

  it('phone drawer: the sparkle opens a sheet whose Confirm dispatches the same action', () => {
    const data = buildData(aiPatch)
    const { container, dispatch } = renderDoc(data, 'edit')
    const item = data.sections[1].items[0]
    fireEvent.click(mobileOf(container, item.id).querySelector('[data-testid="row-ai-price-mark"]')!)
    expect(screen.getByTestId('row-ai-price-sheet')).toBeTruthy()
    fireEvent.click(screen.getByTestId('row-ai-price-confirm'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CONFIRM_ITEM_PRICE',
      sectionId: data.sections[1].id,
      itemId: item.id,
    })
  })
})

function buildEstimate(): EstimateWithSections {
  return {
    id: 'est-1', project_id: 'proj-1', company_id: 'company-1', currency_code: 'USD', version: 1,
    estimate_seq: 1, estimate_number: null, estimate_date: null, is_current: true, share_token: 'tok',
    public_slug_token: null, status: 'draft', language: 'en', summary: null, notes: null, timeline: null,
    payment_terms: null, warranty_terms: null, subtotal: 24, discount_type: null, discount_value: 0,
    discount_amount: 0, tax_rate: 0, tax_amount: 0, total: 24, deposit_type: 'none', deposit_value: null,
    balance_due: null, sent_at: null, viewed_at: null, responded_at: null, client_response: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    presentation_settings: null, attachedPhotos: [], hasSignature: false,
    sections: [{
      id: 'sec-1', estimate_id: 'est-1', company_id: 'company-1', title: 'General', sort_order: 0, subtotal: 24,
      items: [
        { id: 'a', section_id: 'sec-1', company_id: 'company-1', description: 'A', quantity: 1, unit: 'ea', unit_price: 24, total: 24, sort_order: 0, price_source: 'ai_estimate', confidence: 'low', basis: 'b', taxable: true },
      ],
    }],
  } as unknown as EstimateWithSections
}

describe('CONFIRM_ITEM_PRICE reducer', () => {
  it('keeps the price, marks the line as the owner\'s, clears the AI confidence and dirties the estimate', () => {
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))
    expect(result.current[0].isDirty).toBe(false)
    const epoch = result.current[0].editEpoch
    act(() => {
      result.current[1]({ type: 'CONFIRM_ITEM_PRICE', sectionId: 'sec-1', itemId: 'a' })
    })
    const item = result.current[0].sections[0].items[0]
    expect(item.unit_price).toBe(24)
    expect(item.total).toBe(24)
    expect(item.isManuallyEdited).toBe(true)
    expect(item.confidence).toBeNull()
    expect(result.current[0].isDirty).toBe(true)
    expect(result.current[0].editEpoch).toBeGreaterThan(epoch)
  })
})
