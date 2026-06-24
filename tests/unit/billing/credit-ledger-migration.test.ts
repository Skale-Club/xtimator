import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * CREDIT-01 + CREDIT-03 (static SQL contract): the credit_ledger migration must
 * ship an append-only, tenant-readable ledger (RLS via company_members, mirroring
 * phase94 invoices — NEVER companies.user_id) plus the fast-read
 * companies.credit_balance column, the partial-unique idempotency index, and the
 * history index.
 *
 * Static-source-read pattern (mirrors tests/unit/billing/ai-cost-events-migration.test.ts).
 * Pure file read — runs in CI with no DB and no secrets.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260624000004_phase112_credit_ledger.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

const REASONS = ['grant', 'debit', 'topup', 'adjust'] as const

// The FOUR chargeable user-facing ops only (CREDIT-07).
const OPERATION_TYPES = [
  'estimate',
  'photo_batch',
  'audio_minutes',
  'price_research',
] as const

describe('CREDIT-01/CREDIT-03: credit_ledger migration static contract', () => {
  it('creates the table public.credit_ledger idempotently', () => {
    const sql = readMigration()
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.credit_ledger/)
  })

  it('constrains reason via a 4-value CHECK enum (grant/debit/topup/adjust)', () => {
    const sql = readMigration()
    for (const v of REASONS) {
      expect(sql, `missing reason value: ${v}`).toContain(`'${v}'`)
    }
    expect(sql).toMatch(/reason\s+TEXT NOT NULL CHECK/)
  })

  it('constrains operation_type to exactly the four chargeable ops', () => {
    const sql = readMigration()
    for (const v of OPERATION_TYPES) {
      expect(sql, `missing operation_type value: ${v}`).toContain(`'${v}'`)
    }
    expect(sql).toMatch(/operation_type[\s\S]*CHECK/)
  })

  it('does NOT list vision/translation in operation_type (CREDIT-07: sub-calls only)', () => {
    const sql = readMigration()
    // Strip line comments so the documenting header note doesn't false-positive —
    // only the DDL body is checked for the forbidden enum values.
    const code = sql.replace(/--[^\n]*/g, '')
    expect(code).not.toContain("'vision'")
    expect(code).not.toContain("'translation'")
  })

  it('declares delta_credits and balance_after as INTEGER NOT NULL (whole units)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/delta_credits\s+INTEGER NOT NULL/)
    expect(sql).toMatch(/balance_after\s+INTEGER NOT NULL/)
  })

  it('declares real_cost_usd as NULLABLE NUMERIC(12,6) (provenance — null vs 0 discipline)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/real_cost_usd\s+NUMERIC\(12,6\)/)
    expect(sql).not.toMatch(/real_cost_usd\s+NUMERIC\(12,6\)\s+NOT NULL/)
  })

  it('declares markup as NUMERIC(6,3)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/markup\s+NUMERIC\(6,3\)/)
  })

  it('adds the fast-read companies.credit_balance column (NOT NULL DEFAULT 0)', () => {
    const sql = readMigration()
    expect(sql).toMatch(
      /ALTER TABLE public\.companies ADD COLUMN IF NOT EXISTS credit_balance INTEGER NOT NULL DEFAULT 0/
    )
  })

  it('enables row level security', () => {
    const sql = readMigration()
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })

  it('declares a tenant-readable SELECT policy via company_members (NOT companies.user_id)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/credit_ledger_select/)
    expect(sql).toMatch(/FOR SELECT TO authenticated/)
    expect(sql).toMatch(/company_members\.company_id/)
    // Phase 82 invariant: a tenant policy must NEVER reference companies.user_id.
    expect(sql).not.toMatch(/companies\.user_id/)
  })

  it('declares NO client INSERT/UPDATE/DELETE policy (append-only; service-role writes)', () => {
    const sql = readMigration()
    expect(sql).not.toMatch(/FOR\s+INSERT/i)
    expect(sql).not.toMatch(/FOR\s+UPDATE/i)
    expect(sql).not.toMatch(/FOR\s+DELETE/i)
  })

  it('creates the partial-unique idempotency index WHERE idempotency_key IS NOT NULL', () => {
    const sql = readMigration()
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_idempotency/
    )
    expect(sql).toMatch(/WHERE idempotency_key IS NOT NULL/)
  })

  it('creates the company/created history index', () => {
    const sql = readMigration()
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_credit_ledger_company_created/
    )
  })
})
