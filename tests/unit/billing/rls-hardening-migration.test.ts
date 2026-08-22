import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * RLS-HARDEN-01 (static SQL contract): the billing RLS hardening migration
 * must (1) drop the tenant-writable invoices INSERT/UPDATE policies while
 * leaving SELECT intact, (2) restrict authenticated SELECT on credit_ledger
 * to the five tenant-safe columns (never the cost-provenance columns), and
 * (3) lock down the auto-top-up lock functions to service-role only.
 *
 * Static-source-read pattern (mirrors
 * tests/unit/billing/credit-ledger-migration.test.ts). Pure file read — runs
 * in CI with no DB and no secrets. Line endings are normalized (CRLF-safe —
 * this repo's migration-shape tests read CRLF locally on Windows but LF in
 * CI) before every regex/string assertion.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260821000002_billing_rls_hardening.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n')
}

describe('RLS-HARDEN-01: billing RLS hardening migration static contract', () => {
  it('drops the tenant-writable invoices_insert and invoices_update policies', () => {
    const sql = readMigration()
    expect(sql).toContain('DROP POLICY IF EXISTS "invoices_insert" ON public.invoices;')
    expect(sql).toContain('DROP POLICY IF EXISTS "invoices_update" ON public.invoices;')
  })

  it('does not touch the invoices_select policy (owners keep read access)', () => {
    const sql = readMigration()
    expect(sql).not.toMatch(/DROP POLICY[^\n]*invoices_select/)
  })

  it('revokes all SELECT on credit_ledger from authenticated before re-granting', () => {
    const sql = readMigration()
    expect(sql).toContain('REVOKE SELECT ON public.credit_ledger FROM anon, authenticated;')
    expect(sql).toContain(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.credit_ledger FROM anon, authenticated;',
    )
    expect(sql).toContain(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoices FROM anon, authenticated;',
    )
  })

  it('grants back only the five tenant-safe credit_ledger columns', () => {
    const sql = readMigration()
    expect(sql).toMatch(
      /GRANT SELECT \(company_id, delta_credits, reason, operation_type, created_at\)\s*\n?\s*ON public\.credit_ledger TO authenticated;/
    )
  })

  it('never re-grants the cost-provenance columns to authenticated', () => {
    const sql = readMigration()
    // Only check the actual GRANT statement's column list, not comments.
    const grantMatch = sql.match(/GRANT SELECT \(([^)]*)\)\s*\n?\s*ON public\.credit_ledger TO authenticated;/)
    expect(grantMatch).not.toBeNull()
    const columnList = grantMatch![1].split(',').map((c) => c.trim())
    for (const forbidden of ['real_cost_usd', 'markup', 'idempotency_key', 'ref_id', 'balance_after', 'id']) {
      expect(columnList, `forbidden column leaked into GRANT: ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('revokes EXECUTE on acquire_autotopup_lock from PUBLIC, anon, and authenticated', () => {
    const sql = readMigration()
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.acquire_autotopup_lock(UUID, INTEGER) FROM PUBLIC, anon, authenticated;'
    )
  })

  it('revokes EXECUTE on release_autotopup_lock from PUBLIC, anon, and authenticated', () => {
    const sql = readMigration()
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.release_autotopup_lock(UUID) FROM PUBLIC, anon, authenticated;'
    )
  })
})
