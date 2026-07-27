import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * PARITY-02 / PARITY-03 — STATIC SOURCE GUARD proving the 3 settings tabs
 * Plan 01 makes reachable for demo sessions (Company / Team / Notifications)
 * all wire `isDemoCompany` into their existing (Company: `readOnly`, Team:
 * `canManage`) or newly-added (Notifications: `readOnly`) read-only props.
 *
 * Pure readFileSync grep — no DB, no mocks, no secrets. Mirrors
 * tests/unit/settings/team-section-no-hardcode.test.ts.
 */

const ROOT = process.cwd()

describe('PARITY-02/03: demo read-only wiring across Company/Team/Notifications tabs', () => {
  describe('NotificationsForm gains a readOnly prop cascading via fieldset', () => {
    const src = readFileSync(
      resolve(ROOT, 'components/settings/notifications-form.tsx'),
      'utf8',
    )

    it('declares readOnly?: boolean on NotificationsFormProps', () => {
      expect(src).toMatch(/readOnly\?:\s*boolean/)
    })

    it('wraps the form in a fieldset disabled by readOnly', () => {
      expect(src).toMatch(/<fieldset disabled=\{readOnly\}/)
    })

    it('shows the exact read-only demo footer note copy', () => {
      expect(src).toContain(
        'This is a read-only demo. Create a free account to manage your notification settings.',
      )
    })
  })

  describe('notifications tab page wires isDemoCompany into NotificationsForm', () => {
    const src = readFileSync(
      resolve(ROOT, 'app/(app)/settings/(tabs)/notifications/page.tsx'),
      'utf8',
    )

    it('imports isDemoCompany', () => {
      expect(src).toMatch(/isDemoCompany/)
    })

    it('passes readOnly={isDemoCompany(companyId)} to NotificationsForm', () => {
      expect(src).toContain('readOnly={isDemoCompany(companyId)}')
    })
  })

  describe('company tab page wires isDemoCompany into CompanyInfoForm', () => {
    const src = readFileSync(
      resolve(ROOT, 'app/(app)/settings/(tabs)/company/page.tsx'),
      'utf8',
    )

    it('passes readOnly={isDemoCompany(company.id)} to CompanyInfoForm', () => {
      expect(src).toContain('readOnly={isDemoCompany(company.id)}')
    })
  })

  describe('team tab page forces canManage off for the demo company', () => {
    const src = readFileSync(
      resolve(ROOT, 'app/(app)/settings/(tabs)/team/page.tsx'),
      'utf8',
    )

    it('gates canManage on !isDemoCompany(companyId)', () => {
      expect(src).toContain(
        "canManage = !isDemoCompany(companyId) && (role === 'owner' || role === 'admin')",
      )
    })
  })
})
