import { describe, expect, it } from 'vitest'
import { verifyEvalBudget } from '@/lib/ai/eval-budget'

const capped = { limit: 5, limit_remaining: 5, limit_reset: null, is_management_key: false }

describe('live evaluation budget gate', () => {
  it('accepts the approved non-resetting key and returns metadata only', () => {
    expect(verifyEvalBudget({ ...capped, label: 'private label', key: 'must not escape' }))
      .toEqual({ limitUsd: 5, remainingUsd: 5, resets: false })
  })
  it.each([null, 0, -1, 6, Infinity, NaN, '5'])('rejects an unverifiable or excessive total limit %s', limit => {
    expect(() => verifyEvalBudget({ ...capped, limit })).toThrow()
  })
  it.each(['daily', 'weekly', 'monthly', undefined])('rejects resetting/unknown budget interval %s', limit_reset => {
    expect(() => verifyEvalBudget({ ...capped, limit_reset })).toThrow()
  })
  it.each([null, 0, -1, 6, Infinity, NaN, '5'])('rejects an unverifiable remaining amount %s', limit_remaining => {
    expect(() => verifyEvalBudget({ ...capped, limit_remaining })).toThrow()
  })
  it('rejects management keys and accepts a smaller remaining budget', () => {
    expect(() => verifyEvalBudget({ ...capped, is_management_key: true })).toThrow()
    expect(verifyEvalBudget({ ...capped, limit_remaining: 2 })).toEqual({ limitUsd: 5, remainingUsd: 2, resets: false })
  })
})
