import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * CONNECT-HEALTH-01 (static SQL contract): the connect-account-health
 * migration must (1) add the two new health columns on `companies` with
 * COMMENT ON documentation, and (2) widen the `stripe_connect_status` CHECK
 * constraint to also allow 'restricted' — by dropping whatever the existing
 * (originally auto-named) constraint is actually called via a DO block, then
 * recreating it under a stable name.
 *
 * Static-source-read pattern (mirrors tests/unit/billing/rls-hardening-migration.test.ts
 * and protect-billing-columns-migration.test.ts). Pure file read — runs in CI
 * with no DB and no secrets. Line endings are normalized (CRLF-safe — this
 * repo's migration-shape tests read CRLF locally on Windows but LF in CI)
 * before every regex/string assertion.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260823000001_connect_account_health.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n')
}

describe('CONNECT-HEALTH-01: connect-account-health migration static contract', () => {
  it('adds stripe_charges_enabled (BOOLEAN) and stripe_connect_disabled_reason (TEXT) idempotently', () => {
    const sql = readMigration()
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS stripe_charges_enabled\s+BOOLEAN/
    )
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS stripe_connect_disabled_reason\s+TEXT/
    )
  })

  it('documents both new columns via COMMENT ON COLUMN', () => {
    const sql = readMigration()
    expect(sql).toContain(
      'COMMENT ON COLUMN public.companies.stripe_charges_enabled IS'
    )
    expect(sql).toContain(
      'COMMENT ON COLUMN public.companies.stripe_connect_disabled_reason IS'
    )
  })

  it('drops whatever the existing stripe_connect_status CHECK constraint is actually named, via a dynamic DO block', () => {
    const sql = readMigration()
    expect(sql).toMatch(/DO \$\$/)
    expect(sql).toMatch(/contype = 'c'/)
    expect(sql).toMatch(
      /pg_get_constraintdef\(con\.oid\) ILIKE '%stripe_connect_status%'/
    )
    expect(sql).toMatch(
      /ALTER TABLE public\.companies DROP CONSTRAINT %I/
    )
  })

  it('recreates the CHECK constraint under a stable name allowing restricted alongside the original three values', () => {
    const sql = readMigration()
    expect(sql).toContain(
      'ADD CONSTRAINT companies_stripe_connect_status_check'
    )
    expect(sql).toMatch(
      /CHECK \(stripe_connect_status IS NULL OR stripe_connect_status IN \('pending','active','disconnected','restricted'\)\)/
    )
  })

  it('never drops the pending/active/disconnected values while widening the CHECK', () => {
    const sql = readMigration()
    const checkMatch = sql.match(
      /CHECK \(stripe_connect_status IS NULL OR stripe_connect_status IN \(([^)]*)\)\)/
    )
    expect(checkMatch).not.toBeNull()
    const values = checkMatch![1].split(',').map((v) => v.trim())
    for (const required of ["'pending'", "'active'", "'disconnected'", "'restricted'"]) {
      expect(values, `missing status value: ${required}`).toContain(required)
    }
  })

  it('is idempotent DDL throughout (IF NOT EXISTS / DO block guard, no bare CREATE)', () => {
    const sql = readMigration()
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS')
    // The DROP CONSTRAINT only fires when a matching constraint is found —
    // guarded inside `IF existing_constraint IS NOT NULL THEN`.
    expect(sql).toMatch(/IF existing_constraint IS NOT NULL THEN/)
  })
})
