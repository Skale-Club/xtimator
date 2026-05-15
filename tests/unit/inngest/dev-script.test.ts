import { describe, it, expect } from 'vitest'

/**
 * INNGEST-08: package.json dev:inngest script (Wave 0 RED stub).
 *
 * Plan 67-02 adds a `dev:inngest` script to package.json that runs the
 * inngest-cli dev server pointed at the Next.js dev port. Contract:
 *   - scripts.dev:inngest exists
 *   - the script string contains the URL `http://localhost:9633/api/inngest`
 *     (matches `next dev --port 9633`; without `-u` flag, inngest-cli does not
 *     auto-discover the serve handler on a non-default port)
 */
describe('INNGEST-08: package.json dev:inngest script', () => {
  it('package.json scripts.dev:inngest contains the URL "http://localhost:9633/api/inngest"', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-02) adds dev:inngest script to package.json')
  })
})
