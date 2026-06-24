import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * COST-03 (static SQL contract): the ai_cost_events migration must ship an
 * append-only cost table with deny-all RLS + a single super-admin SELECT policy,
 * a NULLABLE real_cost_usd (null vs 0 discipline), the operation_type/provider
 * CHECK enums, and the three named indexes.
 *
 * Static-source-read pattern (mirrors tests/unit/observability/pipeline-events-migration.test.ts).
 * Pure file read — runs in CI with no DB and no secrets.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260624000003_phase110_ai_cost_events.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

const INDEXES = [
  'ai_cost_events_attempt_id',
  'ai_cost_events_op_created',
  'ai_cost_events_company',
] as const

const OPERATION_TYPES = [
  'estimate',
  'photo_batch',
  'audio_minutes',
  'price_research',
  'translation',
  'vision',
] as const

const PROVIDERS = ['openrouter', 'openai', 'anthropic', 'gemini'] as const

describe('COST-03: ai_cost_events migration static contract', () => {
  it('creates the table public.ai_cost_events idempotently', () => {
    const sql = readMigration()
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.ai_cost_events/)
  })

  it('declares real_cost_usd as NULLABLE NUMERIC(12,6) (null vs 0 discipline)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/real_cost_usd\s+NUMERIC\(12,6\)/)
    // Must NOT be NOT NULL — null = provider returned no cost, never coerced to 0.
    expect(sql).not.toMatch(/real_cost_usd\s+NUMERIC\(12,6\)\s+NOT NULL/)
  })

  it('enables row level security (deny-all base)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })

  it('declares the super-admin FOR SELECT policy via platform_admins + auth.uid()', () => {
    const sql = readMigration()
    expect(sql).toMatch(/ai_cost_events_select_super_admin/)
    expect(sql).toMatch(/platform_admins/)
    expect(sql).toMatch(/auth\.uid\(\)/)
  })

  it('declares NO client INSERT/UPDATE/DELETE policy (deny-all writes)', () => {
    const sql = readMigration()
    expect(sql).not.toMatch(/FOR\s+INSERT/i)
    expect(sql).not.toMatch(/FOR\s+UPDATE/i)
    expect(sql).not.toMatch(/FOR\s+DELETE/i)
  })

  it('creates the three named indexes idempotently', () => {
    const sql = readMigration()
    for (const idx of INDEXES) {
      expect(
        sql,
        `missing index: ${idx}`
      ).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}\\b`))
    }
  })

  it('constrains operation_type via a 6-value CHECK enum', () => {
    const sql = readMigration()
    for (const v of OPERATION_TYPES) {
      expect(sql, `missing operation_type value: ${v}`).toContain(`'${v}'`)
    }
    expect(sql).toMatch(/operation_type[\s\S]*CHECK/)
  })

  it('constrains provider via a 4-value CHECK enum', () => {
    const sql = readMigration()
    for (const v of PROVIDERS) {
      expect(sql, `missing provider value: ${v}`).toContain(`'${v}'`)
    }
    expect(sql).toMatch(/provider[\s\S]*CHECK/)
  })

  it('carries NO credit/ledger/debit/balance/markup column (measure-only)', () => {
    // Strip SQL line comments so the documenting header note doesn't false-positive —
    // we only forbid actual charging columns in the DDL body.
    const code = readMigration().replace(/--[^\n]*/g, '')
    for (const forbidden of ['credit', 'debit', 'ledger', 'balance', 'markup']) {
      expect(
        code,
        `measure-only violation: found "${forbidden}" in migration DDL`
      ).not.toMatch(new RegExp(forbidden, 'i'))
    }
  })
})
