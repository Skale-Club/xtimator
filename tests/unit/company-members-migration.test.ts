// tests/unit/company-members-migration.test.ts
// Phase 79 Plan 01: company_members migration shape (static contract)
//
// Why static: the repo does not ship a live-DB integration harness for migrations
// (Phase 19/24/38 used the same pattern). Runtime backfill verification is performed
// during `supabase db push` in Task 2 of this plan. This test prevents the migration
// file from drifting away from the locked CONTEXT.md decisions.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/20260525000001_phase79_company_members.sql'
)
const SQL = readFileSync(MIGRATION_PATH, 'utf8')

describe('phase 79 — company_members migration shape', () => {
  it('D-01: declares CREATE TABLE company_members', () => {
    expect(SQL).toContain('CREATE TABLE public.company_members')
  })

  it('D-01: composite primary key on (user_id, company_id)', () => {
    expect(SQL).toContain('PRIMARY KEY (user_id, company_id)')
  })

  it('D-01: role constrained to owner (TEXT + CHECK, no PG enum)', () => {
    expect(SQL).toMatch(/CHECK\s*\(role\s+IN\s*\(\s*'owner'\s*\)\s*\)/)
  })

  it('D-03: RLS enabled', () => {
    expect(SQL).toContain('ENABLE ROW LEVEL SECURITY')
  })

  it('D-03: SELECT policy gates by auth.uid()', () => {
    expect(SQL).toContain('CREATE POLICY "company_members_select"')
    expect(SQL).toContain('user_id = (SELECT auth.uid())')
  })

  it('D-03: no INSERT/UPDATE/DELETE policies (writes via service role only)', () => {
    expect(SQL).not.toMatch(/CREATE POLICY[^;]+FOR\s+(INSERT|UPDATE|DELETE)\b/i)
  })

  it('D-02: idempotent backfill from companies with ON CONFLICT DO NOTHING', () => {
    expect(SQL).toContain('INSERT INTO public.company_members')
    expect(SQL).toContain('FROM public.companies')
    expect(SQL).toContain('ON CONFLICT (user_id, company_id) DO NOTHING')
  })

  it('D-01: cascade on auth.users and companies', () => {
    expect(SQL).toMatch(/REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/)
    expect(SQL).toMatch(/REFERENCES\s+companies\(id\)\s+ON\s+DELETE\s+CASCADE/)
  })

  it('D-04: does NOT drop companies.user_id (Phase 82 owns that)', () => {
    expect(SQL).not.toMatch(/ALTER\s+TABLE\s+companies\s+DROP\s+COLUMN\s+user_id/i)
  })

  it('Index on user_id exists for D-07 fallback resolution ORDER BY companies.created_at DESC', () => {
    expect(SQL).toContain('CREATE INDEX company_members_user_id')
  })

  it('Secret handling (CLAUDE.md): no API keys, signing secrets, or sb_secret_/sk-ant-/whsec_ patterns', () => {
    expect(SQL).not.toMatch(/whsec_/)
    expect(SQL).not.toMatch(/sk-ant-/)
    expect(SQL).not.toMatch(/sb_secret_/)
    expect(SQL).not.toMatch(/sk_(test|live)_/)
  })
})
