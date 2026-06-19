import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * INVOICE-02 (static SQL contract): the Phase 94 invoices migration must ship
 * the immutable-snapshot table, company_members-pattern RLS, the kind/status
 * CHECK enums, the amount_cents > 0 guard, and the 3 named indexes.
 *
 * Static-source-read pattern (mirrors pipeline-events-migration.test.ts +
 * phase82-rls-migration.test.ts). GREEN: the migration file ships in Task 1
 * of this plan, so this contract is satisfied immediately.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260619000001_phase94_invoices.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

const COLUMNS = [
  'id',
  'estimate_id',
  'company_id',
  'kind',
  'amount_cents',
  'currency_code',
  'project_name',
  'description',
  'status',
  'stripe_invoice_id',
  'stripe_customer_id',
  'hosted_invoice_url',
  'invoice_pdf_url',
  'paid_at',
  'created_at',
  'updated_at',
] as const

const INDEXES = [
  'idx_invoices_stripe_invoice_id',
  'idx_invoices_estimate_id',
  'idx_invoices_company_id',
] as const

describe('INVOICE-02: invoices migration static contract', () => {
  it('migration file exists at the expected path', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
  })

  it('creates the table public.invoices', () => {
    expect(readMigration()).toMatch(/CREATE TABLE IF NOT EXISTS public\.invoices/)
  })

  it('enables row level security', () => {
    expect(readMigration()).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })

  it('contains all 16 D-08 column names', () => {
    const sql = readMigration()
    for (const col of COLUMNS) {
      expect(sql, `missing column: ${col}`).toMatch(new RegExp(`\\b${col}\\b`))
    }
  })

  it('constrains kind via a CHECK enum of all 3 values', () => {
    const sql = readMigration()
    for (const v of ['deposit', 'balance', 'full']) {
      expect(sql, `missing kind value: ${v}`).toContain(`'${v}'`)
    }
    expect(sql).toMatch(/kind\s+TEXT\s+NOT NULL\s+CHECK\s*\(kind IN/)
  })

  it('constrains status via a CHECK enum of all 5 Stripe lifecycle values', () => {
    const sql = readMigration()
    for (const v of ['draft', 'open', 'paid', 'void', 'uncollectible']) {
      expect(sql, `missing status value: ${v}`).toContain(`'${v}'`)
    }
    expect(sql).toMatch(/status IN \('draft','open','paid','void','uncollectible'\)/)
  })

  it('guards amount_cents with CHECK (amount_cents > 0)', () => {
    expect(readMigration()).toMatch(/amount_cents\s+INTEGER\s+NOT NULL\s+CHECK\s*\(amount_cents > 0\)/)
  })

  it('creates the 3 named indexes', () => {
    const sql = readMigration()
    for (const idx of INDEXES) {
      expect(sql, `missing index: ${idx}`).toMatch(new RegExp(`\\b${idx}\\b`))
    }
  })

  it('uses the Phase 82 company_members RLS pattern (>= 3 occurrences)', () => {
    const sql = readMigration()
    const matches = sql.match(/FROM company_members/gi) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })

  it('does NOT use the legacy companies.user_id RLS pattern outside comments', () => {
    const sql = readMigration()
    const body = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
    expect(body).not.toMatch(/FROM\s+companies/i)
  })

  it('declares a SELECT, INSERT, and UPDATE policy', () => {
    const sql = readMigration()
    expect(sql).toMatch(/FOR SELECT/)
    expect(sql).toMatch(/FOR INSERT/)
    expect(sql).toMatch(/FOR UPDATE/)
  })

  it('declares NO DELETE policy (financial records are voided, not deleted)', () => {
    const body = readMigration()
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
    expect(body).not.toMatch(/FOR\s+DELETE/i)
  })
})
