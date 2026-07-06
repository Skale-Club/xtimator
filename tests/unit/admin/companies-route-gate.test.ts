/**
 * Wave 0 — companies admin overhaul: requireAdmin() gate + independent Demo
 * Accounts query.
 * Tests: static source assertion that requireAdmin() precedes
 * requireServiceClient(), the page opts into force-dynamic, and the Demo
 * Accounts query is independent of the new paginated All Companies query.
 * RED until Task 2 rewrites app/admin/companies/page.tsx.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('companies/page.tsx: requireAdmin() gate + independent Demo Accounts query', () => {
  it('imports/calls requireAdmin', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/companies/page.tsx'), 'utf8')
      expect(src).toMatch(/requireAdmin/)
    } catch {
      expect.fail('Wave 0: app/admin/companies/page.tsx not yet written')
    }
  })

  it('calls requireAdmin() before requireServiceClient()', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/companies/page.tsx'), 'utf8')
      const adminIdx = src.indexOf('requireAdmin()')
      const svcIdx = src.indexOf('requireServiceClient()')
      expect(adminIdx).toBeGreaterThan(-1)
      expect(svcIdx).toBeGreaterThan(-1)
      expect(adminIdx).toBeLessThan(svcIdx)
    } catch {
      expect.fail('Wave 0: app/admin/companies/page.tsx not yet written')
    }
  })

  it('exports dynamic = "force-dynamic"', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/companies/page.tsx'), 'utf8')
      expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/)
    } catch {
      expect.fail('Wave 0: app/admin/companies/page.tsx not yet written')
    }
  })

  it('Demo Accounts query is independent of the paginated All Companies query (.range appears exactly once)', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/companies/page.tsx'), 'utf8')
      const rangeMatches = src.match(/\.range\(/g) ?? []
      expect(rangeMatches.length).toBe(1)
      expect(src).toMatch(/demoCompanies/)
    } catch {
      expect.fail('Wave 0: app/admin/companies/page.tsx not yet written')
    }
  })
})
