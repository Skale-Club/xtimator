import { describe, it, expect } from 'vitest'

/**
 * INNGEST-05: GET /api/jobs/[jobId] proxy route (Wave 0 RED stub).
 *
 * NEW route — does not exist yet. Plan 67-05 delivers
 * app/api/jobs/[jobId]/route.ts. Contract:
 *   - requires authentication (401 when no claims)
 *   - proxies to https://api.inngest.com/v1/events/{jobId}/runs with
 *     `Authorization: Bearer ${INNGEST_SIGNING_KEY}` header
 *   - returns { status, output } shape — status is one of
 *     'Running' | 'Completed' | 'Failed' | 'Cancelled'
 *
 * Why proxy? Browser must never see INNGEST_SIGNING_KEY.
 */
describe('INNGEST-05: GET /api/jobs/[jobId] proxy', () => {
  it('requires authentication (401 when no claims)', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-05) creates app/api/jobs/[jobId]/route.ts')
  })

  it('proxies to https://api.inngest.com/v1/events/{jobId}/runs with Bearer auth header', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-05) creates app/api/jobs/[jobId]/route.ts')
  })

  it('returns { status, output } shape', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-05) creates app/api/jobs/[jobId]/route.ts')
  })
})
