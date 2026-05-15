import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * INNGEST-08: package.json dev:inngest script (Wave 1 GREEN).
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
    const pkgPath = resolve(process.cwd(), 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts).toBeDefined()
    expect(pkg.scripts['dev:inngest']).toBeDefined()
    expect(pkg.scripts['dev:inngest']).toContain('http://localhost:9633/api/inngest')
  })
})
