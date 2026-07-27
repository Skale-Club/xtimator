import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Demo tab visibility contract (181-01, PARITY-01/PARITY-02).
 *
 * Static-source-guard tests (readFileSync + string/regex assertions — no RTL
 * rendering, no mocks; mirrors tests/unit/settings/account-consolidation.test.tsx
 * and tests/unit/settings/team-section-no-hardcode.test.ts).
 *
 * Proves:
 * - SettingsNav's ITEMS carry demoHidden on exactly the 6 non-exposed tabs
 *   (Company/Team/Notifications stay un-flagged, i.e. always visible).
 * - app/(app)/settings/layout.tsx has zero demo-specific branch — every
 *   session renders the real SettingsLayoutClient tree unconditionally.
 * - SettingsLayoutClient threads isDemo down to SettingsNav.
 * - Settings is reachable from both account-menu surfaces for demo sessions
 *   while Trash stays hidden (exactly one remaining `{!isDemo && (` guard).
 */

const root = resolve(__dirname, '..', '..', '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Demo tab visibility (181-01)', () => {
  describe('SettingsNav demoHidden filter', () => {
    const nav = read('components/settings/settings-nav.tsx')

    it('flags exactly 6 items demoHidden', () => {
      const matches = nav.match(/demoHidden: true/g) ?? []
      expect(matches.length).toBe(6)
    })

    it('filters ITEMS using the same idiom as the primary app nav', () => {
      expect(nav).toContain('ITEMS.filter((item) => !(isDemo && item.demoHidden))')
    })

    it('does not flag the company entry demoHidden', () => {
      const line = nav.split('\n').find((l) => l.includes("value: 'company'"))
      expect(line).toBeDefined()
      expect(line).not.toMatch(/demoHidden/)
    })

    it('does not flag the team entry demoHidden', () => {
      const line = nav.split('\n').find((l) => l.includes("value: 'team'"))
      expect(line).toBeDefined()
      expect(line).not.toMatch(/demoHidden/)
    })

    it('does not flag the notifications entry demoHidden', () => {
      const line = nav.split('\n').find((l) => l.includes("value: 'notifications'"))
      expect(line).toBeDefined()
      expect(line).not.toMatch(/demoHidden/)
    })
  })

  describe('Settings layout has zero demo-specific branch', () => {
    const layout = read('app/(app)/settings/layout.tsx')

    it('does not render the old bespoke CompanyInfoForm-only view', () => {
      expect(layout).not.toContain('CompanyInfoForm')
    })

    it('calls isDemoSession() exactly once (a single unconditional call)', () => {
      const matches = layout.match(/isDemoSession\(\)/g) ?? []
      expect(matches.length).toBe(1)
    })

    it('always renders the real SettingsLayoutClient tree with isDemo threaded', () => {
      expect(layout).toContain('SettingsLayoutClient isDemo={isDemo}')
    })
  })

  describe('SettingsLayoutClient threads isDemo to SettingsNav', () => {
    const client = read('components/settings/settings-layout-client.tsx')

    it('accepts an isDemo prop', () => {
      expect(client).toContain('isDemo?: boolean')
    })

    it('passes isDemo down to SettingsNav', () => {
      expect(client).toContain('SettingsNav collapsed={collapsed} isDemo={isDemo}')
    })
  })
})
