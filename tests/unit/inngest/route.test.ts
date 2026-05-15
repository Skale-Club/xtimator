import { describe, it, expect } from 'vitest'

/**
 * INNGEST-01: app/api/inngest/route.ts serve handler (Wave 0 RED stub).
 *
 * Plan 67-02 wires the official `serve()` adapter from `inngest/next`.
 * Contract:
 *   - module exports GET, POST, PUT (the documented triplet)
 *   - serve() is configured with the singleton client + the four jobs
 */
describe('INNGEST-01: app/api/inngest/route', () => {
  it('exports GET, POST, PUT from serve()', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-02) delivers app/api/inngest/route.ts')
  })

  it('serve() is configured with the inngest client + functions array containing all 4 jobs', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-02) registers all 4 functions')
  })
})
