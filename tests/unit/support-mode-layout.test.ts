import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readLayout = () => readFileSync(resolve(process.cwd(), 'app/(app)/layout.tsx'), 'utf8')
const readBanner = () => readFileSync(resolve(process.cwd(), 'components/admin/support-mode-banner.tsx'), 'utf8')
const readSupportMode = () => readFileSync(resolve(process.cwd(), 'lib/auth/support-mode.ts'), 'utf8')

describe('app/(app)/layout.tsx: Support Mode branch', () => {
  it('imports getSupportModeSession from @/lib/auth/support-mode', () => {
    try {
      expect(readLayout()).toMatch(/getSupportModeSession/)
    } catch {
      expect.fail('Wave 0: app/(app)/layout.tsx not yet updated with Support Mode branch')
    }
  })

  it('checks getSupportModeSession() BEFORE getActiveCompany()', () => {
    try {
      const src = readLayout()
      const supportIdx = src.indexOf('getSupportModeSession()')
      const activeIdx = src.indexOf('getActiveCompany()')
      expect(supportIdx).toBeGreaterThan(-1)
      expect(activeIdx).toBeGreaterThan(-1)
      expect(supportIdx).toBeLessThan(activeIdx)
    } catch {
      expect.fail('Wave 0: app/(app)/layout.tsx not yet updated with Support Mode branch')
    }
  })

  it('imports SupportModeBanner from @/components/admin/support-mode-banner', () => {
    try {
      expect(readLayout()).toMatch(/SupportModeBanner/)
    } catch {
      expect.fail('Wave 0: app/(app)/layout.tsx not yet updated with Support Mode branch')
    }
  })

  it('suppresses the company switcher by passing an empty memberships array in the support-mode branch', () => {
    try {
      const src = readLayout()
      expect(src).toMatch(/memberships=\{?\[\]\}?/)
    } catch {
      expect.fail('Wave 0: app/(app)/layout.tsx not yet updated with Support Mode branch')
    }
  })

  it('the support-mode branch does not also render DemoBanner or TrialBanner (branch isolation)', () => {
    try {
      const src = readLayout()
      // Isolate the support-mode conditional block: from the getSupportModeSession
      // check to the next top-level `const company = await getActiveCompany()` call
      // (the normal-flow resumption point). DemoBanner/TrialBanner must not appear
      // in that slice.
      const start = src.indexOf('getSupportModeSession()')
      const end = src.indexOf('getActiveCompany()')
      expect(start).toBeGreaterThan(-1)
      expect(end).toBeGreaterThan(start)
      const branchSlice = src.slice(start, end)
      expect(branchSlice).not.toMatch(/<DemoBanner/)
      expect(branchSlice).not.toMatch(/<TrialBanner/)
    } catch {
      expect.fail('Wave 0: app/(app)/layout.tsx not yet updated with Support Mode branch')
    }
  })
})

describe('components/admin/support-mode-banner.tsx: contract', () => {
  it('uses the ShieldCheck icon (continuity with /admin banner, per UI-SPEC)', () => {
    try {
      expect(readBanner()).toMatch(/ShieldCheck/)
    } catch {
      expect.fail('Wave 0: components/admin/support-mode-banner.tsx not yet written')
    }
  })

  it('exit CTA calls endSupportSession via a form action', () => {
    try {
      const src = readBanner()
      expect(src).toMatch(/endSupportSession/)
      expect(src).toMatch(/<form\s+action=\{?\s*endSupportSession/)
    } catch {
      expect.fail('Wave 0: components/admin/support-mode-banner.tsx not yet written')
    }
  })

  it('contains the new "Viewing ... as ..." copy (View as Company rename)', () => {
    try {
      expect(readBanner()).toMatch(/Viewing/)
    } catch {
      expect.fail('Wave 0: components/admin/support-mode-banner.tsx not yet written')
    }
  })

  it("exiting Support Mode actually navigates back to /admin/companies — endSupportSession() calls redirect('/admin/companies')", () => {
    // This is NOT a banner-file check — the banner only binds <form action={endSupportSession}>;
    // the navigation itself happens inside endSupportSession() (Plan 01's lib/auth/support-mode.ts),
    // mirroring lib/demo/actions.ts's exitDemoToSignup precedent (redirect() called directly inside
    // the server action). Without this call, clicking "Exit Support Mode" clears the session but
    // does not navigate anywhere — this test proves the must_haves truth "Clicking 'Exit Support
    // Mode' ends the session and returns to /admin/companies" is actually satisfied, not just implemented.
    const src = readSupportMode()
    expect(src).toMatch(/redirect\(\s*['"]\/admin\/companies['"]\s*\)/)
  })
})
