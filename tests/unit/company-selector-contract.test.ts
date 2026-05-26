// tests/unit/company-selector-contract.test.ts
// Phase 81 Plan 03: CompanySelector static contract (SWITCH-17).
//
// Mirrors the Phase 79 contract-test pattern: read source via fs and assert
// against regex. Behavioral correctness is verified by the human-verify
// checkpoint that follows the rewrite task.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC_PATH = join(
  process.cwd(),
  'components',
  'app-shell',
  'company-selector.tsx'
)
const SRC = readFileSync(SRC_PATH, 'utf8')

describe('phase 81 — CompanySelector static contract (SWITCH-17)', () => {
  it('imports useTransition from react', () => {
    expect(SRC).toMatch(
      /import\s+\{[^}]*\buseTransition\b[^}]*\}\s+from\s+['"]react['"]/
    )
  })

  it('imports switchActiveCompany from @/lib/actions/active-company', () => {
    expect(SRC).toMatch(
      /import\s+\{[^}]*\bswitchActiveCompany\b[^}]*\}\s+from\s+['"]@\/lib\/actions\/active-company['"]/
    )
  })

  // Plan-checker gate (SWITCH-17): regression guard. The cookie name MUST be
  // referenced only via the ACTIVE_COMPANY_COOKIE constant exported from
  // lib/queries/active-company.ts — never as a bare string literal here.
  it("never hardcodes the bare string 'active_company_id'", () => {
    expect(SRC).not.toMatch(/['"]active_company_id['"]/)
  })

  it('renders a Link to /onboarding?mode=add', () => {
    expect(SRC).toMatch(/href=["']\/onboarding\?mode=add["']/)
  })

  it('uses Loader2 icon for pending state', () => {
    expect(SRC).toMatch(/\bLoader2\b/)
  })
})
