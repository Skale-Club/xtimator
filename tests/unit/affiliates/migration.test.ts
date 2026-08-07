import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * SEED-054 (static SQL contract) — the affiliate foundation migration must ship
 * the four tables with the constraints the money paths depend on, and RLS that
 * keeps affiliate data invisible to tenants.
 *
 * Static-source-read pattern (mirrors tests/unit/billing/credit-ledger-migration.test.ts).
 * Pure file read — runs in CI with no DB and no secrets.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260805000001_affiliate_foundation.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

const TABLES = [
  'affiliates',
  'affiliate_referrals',
  'affiliate_commissions',
  'affiliate_payouts',
] as const

describe('SEED-054: affiliate foundation migration static contract', () => {
  it('creates all four tables idempotently', () => {
    const sql = readMigration()
    for (const table of TABLES) {
      expect(sql, `missing table: ${table}`).toMatch(
        new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`)
      )
    }
  })

  it('wraps the whole migration in a transaction', () => {
    const sql = readMigration()
    expect(sql).toMatch(/^\s*BEGIN;/m)
    expect(sql).toMatch(/^COMMIT;/m)
  })

  it('enables RLS on every table', () => {
    const sql = readMigration()
    for (const table of TABLES) {
      expect(sql, `RLS not enabled on ${table}`).toMatch(
        new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`)
      )
    }
  })

  it('grants SELECT only — no INSERT/UPDATE/DELETE policy exists (writes are service-role)', () => {
    const sql = readMigration()
    const policyBodies = sql.match(/CREATE POLICY[\s\S]*?;/g) ?? []
    expect(policyBodies.length).toBe(4)
    for (const body of policyBodies) {
      expect(body).toContain('FOR SELECT')
      expect(body).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)\b/)
    }
  })

  it('scopes every read policy to the requesting affiliate, never to a company', () => {
    const sql = readMigration()
    const policyBodies = sql.match(/CREATE POLICY[\s\S]*?;/g) ?? []
    for (const body of policyBodies) {
      expect(body).toContain('auth.uid()')
      // A referred tenant must not be able to see who earns on it — no policy
      // may route through company_members the way tenant tables do.
      expect(body, 'affiliate data must not be company-scoped').not.toContain('company_members')
    }
  })

  it('keeps the Express account id SEPARATE from the Phase-70 Standard account', () => {
    const sql = readMigration()
    // The column lives on affiliates, and the migration must not touch the
    // companies column that holds the tenant's Connect Standard account.
    expect(sql).toMatch(/stripe_account_id\s+text UNIQUE/)
    expect(sql).not.toMatch(/ALTER TABLE (public\.)?companies/)
  })

  it('makes a company attributable to at most one affiliate', () => {
    const sql = readMigration()
    expect(sql).toMatch(/company_id\s+uuid NOT NULL UNIQUE REFERENCES public\.companies\(id\)/)
  })

  it('enforces commission idempotency with a UNIQUE key', () => {
    const sql = readMigration()
    expect(sql).toMatch(/idempotency_key\s+text NOT NULL UNIQUE/)
  })

  it('enforces payout idempotency so a retried run cannot double-transfer', () => {
    const sql = readMigration()
    expect(sql).toMatch(/stripe_transfer_id text UNIQUE/)
    expect(sql).toMatch(/idempotency_key\s+text NOT NULL UNIQUE/)
  })

  it('constrains the commission status enum to the five documented states', () => {
    const sql = readMigration()
    for (const v of ['pending', 'payable', 'paid', 'reversed', 'void']) {
      expect(sql, `missing commission status: ${v}`).toContain(`'${v}'`)
    }
  })

  it('caps stored rates at 100% so a typo cannot overpay', () => {
    const sql = readMigration()
    expect(sql).toMatch(/commission_pct_override <= 1/)
    expect(sql).toMatch(/commission_pct <= 1/)
  })

  it('preserves earned commissions when a referred company is deleted', () => {
    const sql = readMigration()
    expect(sql).toMatch(
      /company_id\s+uuid REFERENCES public\.companies\(id\) ON DELETE SET NULL/
    )
  })

  it('preserves the affiliate row when its auth user is deleted', () => {
    const sql = readMigration()
    expect(sql).toMatch(/user_id\s+uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/)
  })
})
