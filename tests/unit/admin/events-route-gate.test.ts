/**
 * Wave 0 — cross-cutting authz: requireAdmin() on BOTH routes.
 * Tests: static source assertion that requireAdmin() is called before any data read
 * on both app/admin/events/page.tsx and app/admin/events/[attemptId]/page.tsx.
 * RED until Plan 93-03 creates both route files.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('cross-cutting: requireAdmin() gate present on both event routes', () => {
  it('events/page.tsx imports requireAdmin from @/lib/auth/admin-context', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      expect(src).toMatch(/requireAdmin/)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
  })

  it('events/page.tsx calls requireAdmin() before any data read (await requireAdmin appears before requireServiceClient)', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      const adminIdx = src.indexOf('requireAdmin()')
      const svcIdx = src.indexOf('requireServiceClient()')
      expect(adminIdx).toBeGreaterThan(-1)
      expect(svcIdx).toBeGreaterThan(-1)
      expect(adminIdx).toBeLessThan(svcIdx)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
  })

  it('events/[attemptId]/page.tsx imports requireAdmin from @/lib/auth/admin-context', () => {
    try {
      const src = readFileSync(
        resolve(process.cwd(), 'app/admin/events/[attemptId]/page.tsx'),
        'utf8'
      )
      expect(src).toMatch(/requireAdmin/)
    } catch {
      expect.fail('Wave 0: app/admin/events/[attemptId]/page.tsx not yet written')
    }
  })

  it('events/[attemptId]/page.tsx calls requireAdmin() before requireServiceClient()', () => {
    try {
      const src = readFileSync(
        resolve(process.cwd(), 'app/admin/events/[attemptId]/page.tsx'),
        'utf8'
      )
      const adminIdx = src.indexOf('requireAdmin()')
      const svcIdx = src.indexOf('requireServiceClient()')
      expect(adminIdx).toBeGreaterThan(-1)
      expect(svcIdx).toBeGreaterThan(-1)
      expect(adminIdx).toBeLessThan(svcIdx)
    } catch {
      expect.fail('Wave 0: app/admin/events/[attemptId]/page.tsx not yet written')
    }
  })

  it('events/page.tsx exports dynamic = "force-dynamic"', () => {
    try {
      const src = readFileSync(resolve(process.cwd(), 'app/admin/events/page.tsx'), 'utf8')
      expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/)
    } catch {
      expect.fail('Wave 0: app/admin/events/page.tsx not yet written')
    }
  })
})
