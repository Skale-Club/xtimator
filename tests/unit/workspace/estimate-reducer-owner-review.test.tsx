import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useEstimateReducer } from '@/components/workspace/estimate/use-estimate-reducer'
import type { OwnerEstimateReview } from '@/lib/estimate/owner-review'
import type { EstimateWithSections } from '@/lib/queries/estimate'

function makeEstimate(version: number, ownerReview?: OwnerEstimateReview): EstimateWithSections {
  return {
    id: `estimate-${version}`,
    project_id: 'project-1',
    company_id: 'company-1',
    currency_code: 'USD',
    version,
    estimate_seq: version,
    estimate_number: null,
    estimate_date: null,
    is_current: version === 3,
    share_token: `token-${version}`,
    public_slug_token: null,
    status: 'draft',
    language: 'en',
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    subtotal: 0,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total: 0,
    deposit_type: 'none',
    deposit_value: null,
    balance_due: 0,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    view_count: 0,
    last_viewed_at: null,
    share_password_hash: null,
    share_password_set_at: null,
    client_response: null,
    created_at: '2026-11-18T00:00:00.000Z',
    updated_at: '2026-11-18T00:00:00.000Z',
    presentation_settings: null,
    attachedPhotos: [],
    sections: [],
    ...(ownerReview ? { owner_review: ownerReview } : {}),
  }
}

describe('owner review in the estimate editor reducer', () => {
  it('hydrates the review for each selected version and clears it when the version has no review', () => {
    const initialReview: OwnerEstimateReview = {
      questions: ['Is the closet included?'],
      assumptions: [],
      needsReview: true,
      lowConfidenceLines: 1,
      unpricedLines: 0,
    }
    const newerReview: OwnerEstimateReview = {
      questions: ['Should the trim be painted?'],
      assumptions: ['Owner provides paint.'],
      needsReview: true,
      lowConfidenceLines: 0,
      unpricedLines: 2,
    }
    const { result } = renderHook(() => useEstimateReducer(makeEstimate(2, initialReview)))
    expect(result.current[0]).toMatchObject({ id: 'estimate-2', owner_review: initialReview })

    act(() => result.current[1]({ type: 'INIT', estimate: makeEstimate(3, newerReview) }))
    expect(result.current[0]).toMatchObject({ id: 'estimate-3', owner_review: newerReview })

    act(() => result.current[1]({ type: 'INIT', estimate: makeEstimate(1) }))
    expect(result.current[0]).toMatchObject({ id: 'estimate-1', owner_review: null })
  })
})
