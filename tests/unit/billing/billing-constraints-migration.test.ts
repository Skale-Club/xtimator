import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * BILL-CONSTRAINT-01 (static SQL contract): the billing constraints migration
 * must (1) add the two estimates.deposit_value CHECKs (non-negative, percent
 * cap) idempotently, and (2) add the three partial UNIQUE indexes on the
 * companies Stripe mapping columns, dropping the old non-unique
 * idx_companies_stripe_account_id along the way.
 *
 * Static-source-read pattern (mirrors tests/unit/billing/rls-hardening-migration.test.ts).
 * Pure file read — runs in CI with no DB and no secrets. Line endings are
 * normalized (CRLF-safe — this repo's migration-shape tests read CRLF locally
 * on Windows but LF in CI) before every regex/string assertion.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260823000002_billing_constraints.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n')
}

describe('BILL-CONSTRAINT-01: billing constraints migration static contract', () => {
  it('adds the deposit_value non-negative CHECK idempotently (guarded by a pg_constraint lookup)', () => {
    const sql = readMigration()
    expect(sql).toContain(
      "SELECT 1 FROM pg_constraint WHERE conname = 'estimates_deposit_value_nonneg'"
    )
    expect(sql).toContain('ADD CONSTRAINT estimates_deposit_value_nonneg')
    expect(sql).toContain('CHECK (deposit_value IS NULL OR deposit_value >= 0)')
  })

  it('adds the deposit_value percent-cap CHECK idempotently (guarded by a pg_constraint lookup)', () => {
    const sql = readMigration()
    expect(sql).toContain(
      "SELECT 1 FROM pg_constraint WHERE conname = 'estimates_deposit_value_percent_cap'"
    )
    expect(sql).toContain('ADD CONSTRAINT estimates_deposit_value_percent_cap')
    expect(sql).toContain(
      "CHECK (deposit_type <> 'percent' OR deposit_value IS NULL OR deposit_value <= 100)"
    )
  })

  it('both CHECK DO blocks target public.estimates', () => {
    const sql = readMigration()
    const doBlocks = sql.match(/DO \$do\$[\s\S]*?END \$do\$;/g) ?? []
    expect(doBlocks.length).toBeGreaterThanOrEqual(2)
    const checkBlocks = doBlocks.filter((b) => b.includes('ALTER TABLE public.estimates'))
    expect(checkBlocks.length).toBe(2)
  })

  it('creates all three partial UNIQUE indexes on the Stripe mapping columns', () => {
    const sql = readMigration()
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_stripe_customer_id_unique\s*\n\s*ON public\.companies\(stripe_customer_id\) WHERE stripe_customer_id IS NOT NULL;/
    )
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_stripe_subscription_id_unique\s*\n\s*ON public\.companies\(stripe_subscription_id\) WHERE stripe_subscription_id IS NOT NULL;/
    )
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_stripe_account_id_unique\s*\n\s*ON public\.companies\(stripe_account_id\) WHERE stripe_account_id IS NOT NULL;/
    )
  })

  it('drops the old non-unique idx_companies_stripe_account_id before creating the unique replacement', () => {
    const sql = readMigration()
    const dropIdx = sql.indexOf('DROP INDEX IF EXISTS idx_companies_stripe_account_id;')
    const createIdx = sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_stripe_account_id_unique')
    expect(dropIdx).toBeGreaterThan(-1)
    expect(createIdx).toBeGreaterThan(-1)
    expect(dropIdx).toBeLessThan(createIdx)
  })

  it('every index/constraint statement is idempotent (IF NOT EXISTS / pg_constraint guard present)', () => {
    const sql = readMigration()
    const createIndexLines = sql
      .split('\n')
      .filter((line) => line.trim().startsWith('CREATE UNIQUE INDEX') || line.trim().startsWith('CREATE INDEX'))
    for (const line of createIndexLines) {
      expect(line, `not idempotent: ${line}`).toContain('IF NOT EXISTS')
    }
  })
})
