import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * RCACHE-01 (static SQL contract): the price_research_cache migration must ship the
 * table, the 4-tuple UNIQUE key, RLS ENABLED, ZERO tenant policies (service-role-only
 * posture), all neutral-datum + key columns, and unit_price as numeric(12,2).
 *
 * Static-source-read pattern (mirrors tests/unit/observability/pipeline-events-migration.test.ts).
 * No DB — pure regex assertions over the migration file from Plan 106-01.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260624000001_phase106_price_research_cache.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

const COLUMNS = [
  'company_id',
  'normalized_name',
  'region',
  'currency_code',
  'unit_price',
  'source',
  'confidence',
  'expires_at',
  'created_at',
] as const

describe('RCACHE-01: price_research_cache migration static contract', () => {
  it('creates the table public.price_research_cache', () => {
    const sql = readMigration()
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.price_research_cache/)
  })

  it('declares the 4-tuple UNIQUE (company_id, normalized_name, region, currency_code) key', () => {
    const sql = readMigration()
    expect(sql).toMatch(/UNIQUE \(company_id, normalized_name, region, currency_code\)/)
  })

  it('enables row level security', () => {
    const sql = readMigration()
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })

  it('declares ZERO policies (service-role-only posture: no CREATE POLICY, no FOR-clause)', () => {
    const sql = readMigration()
    expect(sql).not.toMatch(/CREATE POLICY/i)
    expect(sql).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE|SELECT)/i)
  })

  it('contains all neutral-datum + key column names', () => {
    const sql = readMigration()
    for (const col of COLUMNS) {
      expect(sql, `missing column: ${col}`).toMatch(new RegExp(`\\b${col}\\b`))
    }
  })

  it('declares unit_price as numeric(12,2)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/numeric\(12,\s*2\)/i)
  })
})
