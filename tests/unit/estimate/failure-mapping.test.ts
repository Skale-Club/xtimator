import { describe, expect, it } from 'vitest'

/**
 * HARD-04 — FailureReason -> XtimatorError mapping (Wave 0 RED scaffold).
 *
 * Pins the typed failure model that plan 99-02 implements (`lib/estimate/failure.ts`):
 *   - failureReasonToXtimatorError(reason, detail?) -> XtimatorError on surface 'estimates'
 *     with the expected ErrorType/statusCode per reason (statusByType unchanged).
 *   - The union is a strict SUPERSET of the only two values produced today
 *     ('generation_failed', 'no_usable_input') so the migration is behavior-preserving.
 *   - failureReasonToChannelCopy returns non-empty human copy (exact strings are
 *     regression-gated by channel-adapter.test.ts; here only presence is asserted).
 *
 * RED today: `@/lib/estimate/failure` does not exist (created in 99-02).
 */

import {
  failureReasonToXtimatorError,
  failureReasonToChannelCopy,
  type FailureReason,
} from '@/lib/estimate/failure'
import { XtimatorError } from '@/lib/errors'

describe('failureReasonToXtimatorError', () => {
  it('maps each FailureReason to the expected ErrorType/status', () => {
    const cases: Array<{
      reason: FailureReason
      type: string
      status: number
    }> = [
      { reason: 'no_usable_input', type: 'bad_request', status: 400 },
      { reason: 'transcription_failed', type: 'internal', status: 500 },
      { reason: 'vision_failed', type: 'internal', status: 500 },
      { reason: 'generation_failed', type: 'internal', status: 500 },
      { reason: 'invalid_output', type: 'internal', status: 500 },
      { reason: 'provider_unavailable', type: 'offline', status: 503 },
    ]

    for (const { reason, type, status } of cases) {
      const err = failureReasonToXtimatorError(reason)
      expect(err).toBeInstanceOf(XtimatorError)
      expect(err.type).toBe(type)
      expect(err.statusCode).toBe(status)
      expect(err.surface).toBe('estimates')
    }
  })

  it('superset — generation_failed and no_usable_input remain valid FailureReason values', () => {
    // The only two values produced today must survive the string->union migration.
    const reasons: FailureReason[] = ['generation_failed', 'no_usable_input']
    for (const reason of reasons) {
      expect(() => failureReasonToXtimatorError(reason)).not.toThrow()
      expect(failureReasonToXtimatorError(reason)).toBeInstanceOf(XtimatorError)
    }
  })
})

describe('failureReasonToChannelCopy', () => {
  it('returns non-empty human copy for generation_failed and no_usable_input', () => {
    const reasons: FailureReason[] = ['generation_failed', 'no_usable_input']
    for (const reason of reasons) {
      const copy = failureReasonToChannelCopy(reason)
      expect(typeof copy).toBe('string')
      expect(copy.length).toBeGreaterThan(0)
    }
  })
})
