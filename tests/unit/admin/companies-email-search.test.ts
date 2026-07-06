/**
 * Wave 0 — ADMINCO-01: email search resolves via auth.admin.listUsers() +
 * company_members, never companies.email directly.
 * RED until Task 2 rewrites app/admin/companies/page.tsx.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('companies/page.tsx: email search resolves via auth.admin.listUsers() + company_members', () => {
  const read = () => readFileSync(resolve(process.cwd(), 'app/admin/companies/page.tsx'), 'utf8')

  it('uses svc.auth.admin.listUsers(', () => {
    try { expect(read()).toMatch(/svc\.auth\.admin\.listUsers\(/) }
    catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })

  it('resolves via company_members', () => {
    try { expect(read()).toMatch(/company_members/) }
    catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })

  it('never searches companies.email directly via ilike', () => {
    try {
      const src = read()
      expect(src).not.toMatch(/\.ilike\(\s*['"]email['"]/)
    } catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })

  it("filters resolved company ids with .in('id', ...) not .eq('id', ...)", () => {
    try {
      const src = read()
      expect(src).toMatch(/\.in\(\s*['"]id['"]/)
    } catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })
})
