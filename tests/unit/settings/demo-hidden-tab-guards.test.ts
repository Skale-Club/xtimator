import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * PARITY-02 (181-03) — STATIC SOURCE GUARD for the demo-hidden settings tabs.
 *
 * Plan 01's SettingsNav filter only hides the nav link — a demo visitor who
 * bookmarks or guesses a hidden tab's URL could still reach it directly. This
 * test proves every settings page NOT in the demo-exposed set (Company, Team,
 * Notifications) carries an `isDemoCompany(...)` redirect guard to
 * `/settings/company`, matching the account-consolidation.test.tsx static
 * readFileSync + string-assertion pattern (no rendering, no DB, no mocks).
 */

const root = resolve(__dirname, '..', '..', '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('demo-hidden settings tab guards (181-03, PARITY-02)', () => {
  describe('app/(app)/settings/(tabs)/account/page.tsx', () => {
    const src = read('app/(app)/settings/(tabs)/account/page.tsx')

    it('imports and calls isDemoCompany', () => {
      expect(src).toContain('isDemoCompany')
    })

    it('redirects a demo session to /settings/company', () => {
      expect(src).toContain("redirect('/settings/company')")
    })

    it('still redirects an unauthenticated session to login', () => {
      expect(src).toContain("redirect('/?auth=login')")
    })
  })

  describe('app/(app)/settings/(tabs)/estimates/page.tsx', () => {
    const src = read('app/(app)/settings/(tabs)/estimates/page.tsx')

    it('guards on isDemoCompany(company.id)', () => {
      expect(src).toContain('isDemoCompany(company.id)')
    })
  })

  describe('app/(app)/settings/(tabs)/appearance/page.tsx', () => {
    const src = read('app/(app)/settings/(tabs)/appearance/page.tsx')

    it('guards on isDemoCompany(companyId)', () => {
      expect(src).toContain('isDemoCompany(companyId)')
    })

    it('is now an async server component', () => {
      expect(src).toContain('export default async function AppearanceTabPage')
    })
  })

  describe('app/(app)/settings/(tabs)/delivery/page.tsx', () => {
    const src = read('app/(app)/settings/(tabs)/delivery/page.tsx')

    it('guards on isDemoCompany(company.id)', () => {
      expect(src).toContain('isDemoCompany(company.id)')
    })
  })

  describe('app/(app)/settings/(tabs)/defaults/page.tsx', () => {
    const src = read('app/(app)/settings/(tabs)/defaults/page.tsx')

    it('gates the redirect target on isDemoCompany(companyId)', () => {
      expect(src).toContain(
        "isDemoCompany(companyId) ? '/settings/company' : '/settings/estimates'"
      )
    })
  })

  describe('app/(app)/settings/billing/page.tsx', () => {
    const src = read('app/(app)/settings/billing/page.tsx')

    it('guards on isDemoCompany(company.id)', () => {
      expect(src).toContain('isDemoCompany(company.id)')
    })
  })

  describe('app/(app)/settings/custom-domain/page.tsx', () => {
    const src = read('app/(app)/settings/custom-domain/page.tsx')

    it('guards on isDemoCompany(settings.id)', () => {
      expect(src).toContain('isDemoCompany(settings.id)')
    })
  })

  describe('app/(app)/settings/estimate-templates/page.tsx', () => {
    const src = read('app/(app)/settings/estimate-templates/page.tsx')

    it('guards on isDemoCompany(template.id)', () => {
      expect(src).toContain('isDemoCompany(template.id)')
    })
  })

  describe('app/(app)/settings/integrations/page.tsx', () => {
    const src = read('app/(app)/settings/integrations/page.tsx')

    it('guards on isDemoCompany(companyId)', () => {
      expect(src).toContain('isDemoCompany(companyId)')
    })
  })

  describe('app/(app)/settings/integrations/mcp/page.tsx', () => {
    const src = read('app/(app)/settings/integrations/mcp/page.tsx')

    it('guards on isDemoCompany(company.id)', () => {
      expect(src).toContain('isDemoCompany(company.id)')
    })
  })

  describe('app/(app)/settings/integrations/stripe/page.tsx', () => {
    const src = read('app/(app)/settings/integrations/stripe/page.tsx')

    it('guards on isDemoCompany(company.id)', () => {
      expect(src).toContain('isDemoCompany(company.id)')
    })
  })

  describe('app/(app)/settings/knowledge/page.tsx', () => {
    const src = read('app/(app)/settings/knowledge/page.tsx')

    it('guards on isDemoCompany(company.id)', () => {
      expect(src).toContain('isDemoCompany(company.id)')
    })
  })

  describe('app/(app)/settings/knowledge/[id]/page.tsx', () => {
    const src = read('app/(app)/settings/knowledge/[id]/page.tsx')

    it('guards on isDemoCompany(company.id)', () => {
      expect(src).toContain('isDemoCompany(company.id)')
    })
  })

  describe('app/(app)/settings/knowledge/new/page.tsx', () => {
    const src = read('app/(app)/settings/knowledge/new/page.tsx')

    it('guards on isDemoCompany(company.id)', () => {
      expect(src).toContain('isDemoCompany(company.id)')
    })
  })

  describe('app/(app)/settings/payments/page.tsx', () => {
    const src = read('app/(app)/settings/payments/page.tsx')

    it('gates the redirect target on isDemoCompany(companyId)', () => {
      expect(src).toContain(
        "isDemoCompany(companyId) ? '/settings/company' : '/settings/integrations/stripe'"
      )
    })
  })
})
