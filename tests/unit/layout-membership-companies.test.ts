import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Phase 81 Plan 04 — Static-contract test for layout + sidebar wiring.
 *
 * Asserts that:
 *   - `app/(app)/layout.tsx` imports + calls `getMembershipCompanies` and passes
 *     the result as a `memberships` prop to `<Sidebar>`.
 *   - `components/app-shell/sidebar.tsx` imports `CompanySelector`, accepts a
 *     `memberships` prop, and mounts `<CompanySelector>` in BOTH the collapsed
 *     and expanded render branches (Pitfall 5 — two render trees).
 *
 * We use the fs+regex approach (mirroring Plan 03's onboarding-mode-add test)
 * because JSX rendering of the full layout pulls in too many server-only deps
 * to be unit-testable cheaply.
 */

const layoutSource = readFileSync(
  resolve(__dirname, '../../app/(app)/layout.tsx'),
  'utf-8',
)
const sidebarSource = readFileSync(
  resolve(__dirname, '../../components/app-shell/sidebar.tsx'),
  'utf-8',
)

describe('layout — memberships wiring (SWITCH-13)', () => {
  it('app/(app)/layout.tsx imports getMembershipCompanies from @/lib/queries/active-company', () => {
    expect(layoutSource).toMatch(
      /import\s+[^;]*\bgetMembershipCompanies\b[^;]*from\s+['"]@\/lib\/queries\/active-company['"]/,
    )
  })

  it('app/(app)/layout.tsx calls getMembershipCompanies()', () => {
    expect(layoutSource).toMatch(/getMembershipCompanies\(\)/)
  })

  it('app/(app)/layout.tsx passes memberships prop to Sidebar', () => {
    expect(layoutSource).toMatch(/memberships=\{memberships\}|memberships:\s*memberships/)
  })
})

describe('sidebar — CompanySelector mount (SWITCH-13, SWITCH-14)', () => {
  it('components/app-shell/sidebar.tsx imports CompanySelector from @/components/app-shell/company-selector', () => {
    expect(sidebarSource).toMatch(
      /import\s+[^;]*\bCompanySelector\b[^;]*from\s+['"]@\/components\/app-shell\/company-selector['"]/,
    )
  })

  it('components/app-shell/sidebar.tsx renders <CompanySelector> in BOTH render branches (collapsed + expanded)', () => {
    const matches = sidebarSource.match(/<CompanySelector\b/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('components/app-shell/sidebar.tsx accepts memberships prop typed as Array<{ id; name; logo_url }>', () => {
    // Either a TS prop signature `memberships: Array<{ ... }>` or `memberships: { ... }[]`
    expect(sidebarSource).toMatch(/memberships\s*:\s*(Array<\s*\{|\{)/)
  })
})
