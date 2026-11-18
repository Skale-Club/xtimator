import { describe, expect, it } from 'vitest'
import { buildOwnerEstimateReview } from '@/lib/estimate/owner-review'

describe('buildOwnerEstimateReview', () => {
  it('orders valid questions by impact and limits questions, assumptions and text length', () => {
    const review = buildOwnerEstimateReview({
      ai_meta: {
        open_questions: [
          { question: 'Low priority', impact: 'low' },
          null,
          { question: 'Unknown priority', impact: 'unknown' },
          { question: 'High priority', impact: 'high' },
          { question: ` ${'X'.repeat(500)} `, impact: 'high' },
          { question: 'Medium priority', impact: 'medium' },
          { question: '  ', impact: 'high' },
        ],
        assumptions: [17, '  Assume ladder access  ', 'Two coats', 'Y'.repeat(500), 'Omitted fourth assumption'],
      },
    })

    expect(review).toEqual({
      questions: ['High priority', 'X'.repeat(240), 'Unknown priority', 'Medium priority'],
      assumptions: ['Assume ladder access', 'Two coats', 'Y'.repeat(240)],
      needsReview: true,
      lowConfidenceLines: 0,
      unpricedLines: 0,
    })
  })

  it('uses the structure band as a plain flag and drops platform-admin diagnostics', () => {
    const review = buildOwnerEstimateReview({
      ai_meta: {
        scope_confidence: 'high',
        exclusions: ['Private exclusion'],
        quality: { band: 'refine', score: 30, findings: ['Private score findings'] },
        source_notes: ['Private source notes'],
        pricing: { diagnostics: { rejected: ['Private search detail'] } },
      },
    })

    expect(review).toEqual({
      questions: [], assumptions: [], needsReview: true, lowConfidenceLines: 0, unpricedLines: 0,
    })
  })

  it('counts low-confidence and missing or nonpositive prices on named lines only', () => {
    const review = buildOwnerEstimateReview({
      sections: [{ items: [
        { description: 'Prep trim', confidence: 'low', unit_price: 115, basis: 'Do not expose this note' },
        { description: 'Supply primer', confidence: 'low', unit_price: 0 },
        { description: 'Apply finish', confidence: 'medium', unit_price: Number.NaN },
        { description: 'Labor', unit_price: -15 },
        { description: 'Miscellaneous' },
        { description: ' ', unit_price: 0, confidence: 'low' },
        { unit_price: 0, confidence: 'low' },
      ] }],
    } as Parameters<typeof buildOwnerEstimateReview>[0])

    expect(review).toEqual({
      questions: [], assumptions: [], needsReview: true, lowConfidenceLines: 2, unpricedLines: 4,
    })
  })

  it('shows assumptions but flags them for review only at low scope confidence', () => {
    for (const scope_confidence of ['high', 'low']) {
      const review = buildOwnerEstimateReview({ ai_meta: { assumptions: ['Access is clear'], scope_confidence } })
      expect(review).toMatchObject({ assumptions: ['Access is clear'], needsReview: scope_confidence === 'low' })
    }
  })

  it('returns null for malformed or internal-only content and normal priced items', () => {
    expect(buildOwnerEstimateReview({ ai_meta: 'invalid metadata' })).toBeNull()
    expect(buildOwnerEstimateReview({
      ai_meta: { open_questions: [{ question: 123 }], quality: { score: '30', band: 'review' } },
      sections: [null, { items: null }, { items: [null] }],
    } as unknown as Parameters<typeof buildOwnerEstimateReview>[0])).toBeNull()
    expect(buildOwnerEstimateReview({
      ai_meta: { pricing: { changes: [{ key: 'private' }] }, source_notes: ['private'] },
      sections: [{ items: [{ description: 'Apply finish', unit_price: 50 }] }],
    })).toBeNull()
  })
})
