// tests/unit/app-layout-active-company.test.ts
// Phase 79 Plan 04: ensure app/(app)/layout.tsx uses active-company helpers
// and the billing query is re-keyed.
//
// This is a STATIC CONTRACT TEST. The behavioral correctness is verified by the
// human-verify checkpoint that follows this task.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const LAYOUT_PATH = join(process.cwd(), 'app', '(app)', 'layout.tsx')
const SRC = readFileSync(LAYOUT_PATH, 'utf8')

describe('phase 79 — app/(app)/layout.tsx active-company switch', () => {
  it('imports getActiveCompany from lib/queries/active-company', () => {
    expect(SRC).toMatch(
      /import\s+\{[^}]*\bgetActiveCompany\b[^}]*\}\s+from\s+['"]@\/lib\/queries\/active-company['"]/
    )
  })

  it('derives activeCompanyId from the resolved active company (no redundant getActiveCompanyId call)', () => {
    // Perf optimization: getActiveCompany() already resolves the active company
    // id internally (and sets the cookie on fallback), so the layout derives
    // activeCompanyId from company.id instead of calling getActiveCompanyId() a
    // second time — that helper re-runs a company_members query, and calling it
    // twice doubled that cost on every authed page load. The billing query is
    // still keyed by activeCompanyId (asserted below), so the contract holds.
    expect(SRC).toMatch(/const\s+activeCompanyId\s*=\s*company\.id/)
  })

  it('no longer calls getCachedCompany(claims.sub)', () => {
    expect(SRC).not.toMatch(/getCachedCompany\s*\(\s*claims\.sub/)
  })

  it("billing row is keyed by id = activeCompanyId (D-10)", () => {
    expect(SRC).toContain(".eq('id', activeCompanyId)")
  })

  it('billing row is NOT keyed by user_id = claims.sub anymore', () => {
    // Allow the .eq('user_id', claims.sub) on platform_admins to remain.
    // We assert the billingRow specifically uses 'id', not 'user_id'.
    // A simple structural check: count occurrences of .eq('user_id', claims.sub)
    // should be exactly 1 (the platform_admins read).
    const matches = SRC.match(/\.eq\(['"]user_id['"]\s*,\s*claims\.sub\)/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('retains redirect("/onboarding") when active company is null', () => {
    expect(SRC).toContain("redirect('/onboarding')")
  })

  it('still imports getAuthClaims (admin check + claims.sub for platform_admins)', () => {
    expect(SRC).toMatch(
      /import\s+\{[^}]*\bgetAuthClaims\b[^}]*\}\s+from\s+['"]@\/lib\/queries\/auth['"]/
    )
  })

  it('does NOT remove getCachedCompany export from lib/queries/auth.ts (D-10 preservation)', () => {
    const AUTH_SRC = readFileSync(
      join(process.cwd(), 'lib', 'queries', 'auth.ts'),
      'utf8'
    )
    expect(AUTH_SRC).toContain('getCachedCompany')
  })
})
