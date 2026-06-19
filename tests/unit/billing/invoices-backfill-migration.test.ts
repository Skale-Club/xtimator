import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * INVOICE-07 (RED until Plan 06): the backfill migration creates one
 * kind='full', status='paid' invoice row per already-paid estimate so payment
 * history is preserved (D-22). This file is delivered in Plan 06; the contract
 * here pins its shape now so Plan 06 makes it GREEN.
 *
 * Static-source-read pattern (mirrors invoices-migration.test.ts).
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260619000003_phase94_backfill_invoices.sql'
)

describe('INVOICE-07: invoices backfill migration static contract', () => {
  it('migration file exists at the expected path', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
  })

  it('inserts into public.invoices', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8')
    expect(sql).toMatch(/INSERT INTO public\.invoices/i)
  })

  it('selects from estimates where payment_status is paid', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8')
    expect(sql).toMatch(/FROM\s+(public\.)?estimates/i)
    expect(sql).toMatch(/payment_status\s*=\s*'paid'/i)
  })

  it("backfills kind 'full' and status 'paid'", () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8')
    expect(sql).toContain("'full'")
    expect(sql).toContain("'paid'")
  })
})
