import { describe, it, expect } from 'vitest'

/**
 * INNGEST-02: POST /api/generate-estimate dispatches via Inngest (Wave 0 RED stub).
 *
 * Plan 67-02 refactors app/api/generate-estimate/route.ts. Contract:
 *   - returns { jobId } shape (HTTP 202 Accepted) in <1s
 *   - does NOT call generateEstimateForProject directly (mock asserts not called)
 *   - does NOT call recordUsage directly — that lives inside the Inngest function
 *   - calls inngest.send() with name 'estimate/generate.requested'
 *     and event id starting with 'estimate-' for event-level idempotency
 */
describe('INNGEST-02: POST /api/generate-estimate dispatch', () => {
  it('returns { jobId } in <1s', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-02) refactors the route to dispatch')
  })

  it('does NOT call generateEstimateForProject directly (work moved into Inngest function)', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-02) refactors the route to dispatch')
  })

  it('does NOT call recordUsage directly (work moved into Inngest function final step)', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-02) refactors the route to dispatch')
  })

  it('calls inngest.send() with name "estimate/generate.requested" and event id starting with "estimate-"', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-02) refactors the route to dispatch')
  })
})
