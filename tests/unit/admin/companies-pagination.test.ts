/**
 * Wave 0 — ADMINCO-03: server-side pagination contract.
 * RED until Task 2 rewrites app/admin/companies/page.tsx.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('companies/page.tsx: server-side pagination contract', () => {
  const read = () => readFileSync(resolve(process.cwd(), 'app/admin/companies/page.tsx'), 'utf8')

  it('PAGE_SIZE = 25', () => {
    try { expect(read()).toMatch(/PAGE_SIZE\s*=\s*25/) }
    catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })

  it('uses .range( for pagination', () => {
    try { expect(read()).toMatch(/\.range\(/) }
    catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })

  it("uses count: 'exact'", () => {
    try { expect(read()).toMatch(/count:\s*['"]exact['"]/) }
    catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })

  it('defines a pageUrl helper', () => {
    try { expect(read()).toMatch(/pageUrl/) }
    catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })

  it('guards the empty resolved-company-ids case so search-by-unmatched-email returns zero rows, not all rows', () => {
    try {
      const src = read()
      const hasLengthGuard = /resolvedCompanyIds(?:[\s\S]{0,80})\.length\s*===\s*0/.test(src)
      const hasSentinelGuard = /00000000-0000-0000-0000-000000000000/.test(src)
      expect(hasLengthGuard || hasSentinelGuard).toBe(true)
    } catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })
})
