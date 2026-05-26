import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260526000002_phase85_companies_rls_or_members.sql',
)
const COMPANY_ACTION_PATH = resolve(__dirname, '../../lib/actions/company.ts')

describe('Phase 85 companies RLS OR-clause — static contract', () => {
  it('migration file exists at the expected path', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
  })

  const sql = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : ''

  it('extends companies_select with company_members OR-clause', () => {
    expect(sql).toMatch(/CREATE POLICY\s+"companies_select"\s+ON\s+public\.companies\s+FOR\s+SELECT[\s\S]*?company_members/i)
  })

  it('extends companies_update with company_members OR-clause (both USING and WITH CHECK)', () => {
    const updateBlock = sql.match(/CREATE POLICY\s+"companies_update"[\s\S]*?;/i)?.[0] ?? ''
    expect(updateBlock).toMatch(/USING[\s\S]*?company_members/i)
    expect(updateBlock).toMatch(/WITH CHECK[\s\S]*?company_members/i)
  })

  it('extends companies_delete with company_members OR-clause', () => {
    expect(sql).toMatch(/CREATE POLICY\s+"companies_delete"\s+ON\s+public\.companies\s+FOR\s+DELETE[\s\S]*?company_members/i)
  })

  it('keeps companies_insert WITH CHECK on user_id only (no member row exists at insert time)', () => {
    const insertBlock = sql.match(/CREATE POLICY\s+"companies_insert"[\s\S]*?;/i)?.[0] ?? ''
    expect(insertBlock).toMatch(/WITH CHECK\s*\(user_id\s*=\s*\(\s*SELECT auth\.uid\(\)\s*\)\s*\)/i)
    expect(insertBlock).not.toMatch(/company_members/i)
  })

  it('wraps rewrite in a transaction and includes an assertion DO block', () => {
    expect(sql).toMatch(/^\s*BEGIN;/m)
    expect(sql).toMatch(/COMMIT;\s*$/m)
    expect(sql).toMatch(/RAISE EXCEPTION\s+'Phase 85/)
  })
})

describe('Phase 85 createOrUpdateCompany mode:add — sets user_id', () => {
  it("mode:'add' branch in lib/actions/company.ts sets user_id on the insert row", () => {
    const source = readFileSync(COMPANY_ACTION_PATH, 'utf8')
    // The insert row construction in mode:'add' must include user_id so the WITH CHECK
    // policy on companies_insert (legacy user_id = auth.uid()) is satisfied.
    expect(source).toMatch(/\{\s*\.\.\.row\s*,\s*user_id:\s*claims\.sub\s*\}/)
  })
})
