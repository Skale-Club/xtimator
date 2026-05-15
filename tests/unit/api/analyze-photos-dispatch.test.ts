import { describe, it, expect } from 'vitest'

/**
 * INNGEST-04: POST /api/analyze-photos dispatches via Inngest (Wave 0 RED stub).
 *
 * Plan 67-03 refactors app/api/analyze-photos/route.ts. Contract:
 *   - returns { jobId } in <1s
 *   - runs checkQuota BEFORE inngest.send() — gating dispatch (failed quota
 *     never enqueues a job)
 *   - does NOT call Anthropic SDK directly (Vision call lives in Inngest function)
 */
describe('INNGEST-04: POST /api/analyze-photos dispatch', () => {
  it('returns { jobId } in <1s', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-03) refactors the route to dispatch')
  })

  it('runs checkQuota BEFORE inngest.send() — gating dispatch', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-03) refactors the route to dispatch')
  })

  it('does NOT call Anthropic SDK directly (Vision moved into Inngest function)', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-03) refactors the route to dispatch')
  })
})
