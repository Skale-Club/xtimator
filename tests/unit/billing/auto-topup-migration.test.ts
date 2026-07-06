import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Phase 153 Plan 02 (CREDITUI-07): auto-top-up companies columns + atomic lock
 * RPC functions migration static contract.
 *
 * Static-source-read pattern (mirrors tests/unit/billing/credit-ledger-migration.test.ts).
 * Pure file read — runs in CI with no DB and no secrets.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260705000002_phase153_auto_topup_columns.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

describe('CREDITUI-07: auto-top-up columns + lock RPC migration static contract', () => {
  it('adds auto_topup_enabled BOOLEAN NOT NULL DEFAULT false to companies', () => {
    const sql = readMigration()
    expect(sql).toMatch(/auto_topup_enabled BOOLEAN NOT NULL DEFAULT false/)
  })

  it('adds auto_topup_threshold_credits as a nullable INTEGER (no NOT NULL, DEFAULT NULL)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/auto_topup_threshold_credits INTEGER DEFAULT NULL/)
    expect(sql).not.toMatch(/auto_topup_threshold_credits INTEGER NOT NULL/)
  })

  it('adds auto_topup_pack_index as a nullable SMALLINT', () => {
    const sql = readMigration()
    expect(sql).toMatch(/auto_topup_pack_index SMALLINT DEFAULT NULL/)
  })

  it('adds auto_topup_in_flight_until as a nullable TIMESTAMPTZ', () => {
    const sql = readMigration()
    expect(sql).toMatch(/auto_topup_in_flight_until TIMESTAMPTZ DEFAULT NULL/)
  })

  it('adds auto_topup_last_failed_at as a nullable TIMESTAMPTZ', () => {
    const sql = readMigration()
    expect(sql).toMatch(/auto_topup_last_failed_at TIMESTAMPTZ DEFAULT NULL/)
  })

  it('uses ADD COLUMN IF NOT EXISTS for every new column (idempotent)', () => {
    const sql = readMigration()
    const newColumns = [
      'auto_topup_enabled',
      'auto_topup_threshold_credits',
      'auto_topup_pack_index',
      'auto_topup_in_flight_until',
      'auto_topup_last_failed_at',
    ]
    for (const col of newColumns) {
      expect(sql, `missing idempotent ADD COLUMN for ${col}`).toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`)
      )
    }
  })

  it('defines acquire_autotopup_lock(p_company_id UUID, p_ttl_seconds INTEGER) RETURNS BOOLEAN', () => {
    const sql = readMigration()
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.acquire_autotopup_lock\(p_company_id UUID, p_ttl_seconds INTEGER DEFAULT 60\)/
    )
    expect(sql).toMatch(/RETURNS BOOLEAN/)
  })

  it('defines release_autotopup_lock(p_company_id UUID) RETURNS VOID', () => {
    const sql = readMigration()
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.release_autotopup_lock\(p_company_id UUID\)/
    )
    expect(sql).toMatch(/RETURNS VOID/)
  })

  it('defines exactly 2 functions (the two lock RPCs)', () => {
    const sql = readMigration()
    const matches = sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []
    expect(matches).toHaveLength(2)
  })
})
