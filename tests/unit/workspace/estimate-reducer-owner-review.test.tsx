import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useEstimateReducer } from '@/components/workspace/estimate/use-estimate-reducer'
import type { OwnerEstimateReview } from '@/lib/estimate/owner-review'
import type { EstimateWithSections } from '@/lib/queries/estimate'

function makeEstimate(version: number, ownerReview?: OwnerEstimateReview): EstimateWithSections {
  const estimate = {
    id: `estimate-${version}`,
    version,
    is_current: version === 3,
    sections: [],
    ...(ownerReview ? { owner_review: ownerReview } : {}),
  } satisfies Pick<EstimateWithSections, 'id' | 'version' | 'is_current' | 'sections' | 'owner_review'>
  return estimate as EstimateWithSections
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
