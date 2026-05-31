import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260526000001_phase82_rls_company_members.sql',
)

describe('Phase 82 RLS migration — static contract', () => {
  it('migration file exists at the expected path', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
  })

  const sql = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : ''

  it('uses the new pattern (FROM company_members ... user_id) at least 46 times', () => {
    const matches = sql.match(/FROM company_members\s+WHERE\s+\(company_members\.user_id/gi) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(46)
  })

  it('does NOT reference the legacy pattern (FROM companies ... user_id) inside any CREATE POLICY body', () => {
    // The single permitted reference is the comment header on line 2 ("-- Legacy: ...").
    // Strip all comment lines and ensure the remaining body has no "FROM companies" occurrences.
    const body = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
    expect(body).not.toMatch(/FROM\s+companies/i)
  })

  it('wraps the entire rewrite in a transaction', () => {
    expect(sql).toMatch(/^\s*BEGIN;/m)
    expect(sql).toMatch(/\nCOMMIT;\s*$/m)
  })

  it('includes a post-rewrite assertion that raises if any legacy policy remains', () => {
    expect(sql).toMatch(/RAISE EXCEPTION\s+'Phase 82 RLS rewrite incomplete/)
    expect(sql).toMatch(/companies\.\*user_id/)
  })

  it('rewrites the 4 high-traffic tenant tables (clients, projects, estimates, recordings) for all 4 CRUD verbs', () => {
    for (const tbl of ['clients', 'projects', 'estimates', 'recordings']) {
      for (const verb of ['select', 'insert', 'update', 'delete']) {
        const re = new RegExp(`CREATE POLICY\\s+"${tbl}_${verb}"\\s+ON\\s+public\\.${tbl}`, 'i')
        expect(sql, `${tbl}_${verb} policy must be recreated`).toMatch(re)
      }
    }
  })
})
