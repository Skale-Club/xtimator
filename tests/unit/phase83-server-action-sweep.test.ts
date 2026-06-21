import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ACTIONS_DIR = resolve(__dirname, '../../lib/actions')

/**
 * Files that intentionally keep `.eq('user_id', claims.sub)` because they pre-date
 * the active-company concept and operate on the user-keyed dimension:
 *
 * - `auth.ts` — post-login redirect "does this user have any company?" check
 *   (the answer is the same whether we look at companies.user_id or company_members
 *   because every owner has both)
 * - `company.ts` — `mode: 'first'` upsert path is per-user by design (initial onboarding)
 * - `active-company.ts` — looks up `company_members.user_id` (different column,
 *   not the legacy `companies.user_id`)
 */
const ALLOWED_LEGACY_FILES = new Set(['auth.ts', 'company.ts', 'active-company.ts'])

describe('Phase 83 server-action sweep — static contract', () => {
  const files = readdirSync(ACTIONS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ name: f, content: readFileSync(resolve(ACTIONS_DIR, f), 'utf8') }))

  for (const { name, content } of files) {
    if (ALLOWED_LEGACY_FILES.has(name)) continue

    it(`lib/actions/${name} does NOT use the legacy .eq('user_id', claims.sub) pattern`, () => {
      // We accept the new pattern: .eq('user_id', claims.sub) WHERE the target table is
      // company_members (different domain — a membership/role lookup, NOT legacy
      // tenant-data scoping by user). Such a lookup pairs an active-company filter
      // with the user filter: `.eq('company_id', <id>).eq('user_id', claims.sub)`
      // on company_members (e.g. staff.ts's owner-role check). Strip those legitimate
      // membership lookups before grepping so only the LEGACY data-scoping pattern
      // (a bare `.eq('user_id', claims.sub)` not gated by an active-company filter)
      // can trip the assertion.
      const withoutMembershipChecks = content.replace(
        /\.eq\(['"]company_id['"][^)]*\)\s*\.eq\(['"]user_id['"]\s*,\s*claims\.sub[^)]*\)/g,
        '',
      )
      expect(
        withoutMembershipChecks,
        `${name} still contains legacy eq('user_id', claims.sub)`,
      ).not.toMatch(/\.eq\(['"]user_id['"]\s*,\s*claims\.sub/)
    })

    it(`lib/actions/${name} imports getActiveCompanyId if it has a getAuthContext helper`, () => {
      const hasGetAuthContext = /async function getAuthContext\b/.test(content)
      if (!hasGetAuthContext) return // Files without the helper need no assertion.
      expect(content, `${name} has getAuthContext but doesn't import getActiveCompanyId`).toMatch(
        /import\s+\{[^}]*getActiveCompanyId[^}]*\}\s+from\s+['"]@\/lib\/queries\/active-company['"]/,
      )
    })
  }
})
