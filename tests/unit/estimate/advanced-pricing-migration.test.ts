import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// TAX-01 static SQL-contract test for the Phase 129 authored-only migration.
// readFileSync + grep only — no DB connection, no API key, no network, no secret.
// Locks the dormant-column shape, types, defaults, and named CHECKs so Phases
// 130-132 can rely on the schema being present with retrocompat defaults.

const MIGRATION = 'supabase/migrations/20260627000001_phase129_advanced_pricing_schema.sql'
const src = readFileSync(MIGRATION, 'utf8')

describe('Phase 129 advanced-pricing migration (TAX-01)', () => {
  it('lands all estimate_items dormant columns idempotently', () => {
    expect(src).toContain('ADD COLUMN IF NOT EXISTS taxable')
    expect(src).toMatch(/taxable\s+BOOLEAN\s+NOT NULL DEFAULT true/)
    expect(src).toContain('ADD COLUMN IF NOT EXISTS tax_category')
    expect(src).toContain('ADD COLUMN IF NOT EXISTS discount')
    expect(src).toMatch(/discount\s+NUMERIC\(12,2\)\s+NOT NULL DEFAULT 0/)
    expect(src).toContain('ADD COLUMN IF NOT EXISTS cost')
    expect(src).toContain('ADD COLUMN IF NOT EXISTS markup_pct')
    expect(src).toMatch(/markup_pct\s+NUMERIC\(7,4\)/)
  })

  it('lands estimates deposit columns with named CHECK', () => {
    expect(src).toMatch(/deposit_type\s+TEXT\s+NOT NULL DEFAULT 'none'/)
    expect(src).toContain('ADD COLUMN IF NOT EXISTS deposit_value')
    expect(src).toContain('ADD COLUMN IF NOT EXISTS balance_due')
    expect(src).toContain("CHECK (deposit_type IN ('none', 'percent', 'amount'))")
    expect(src).toContain('estimates_deposit_type_check')
  })

  it('lands companies.tax_config as nullable JSONB', () => {
    expect(src).toMatch(/tax_config\s+JSONB/)
  })

  it('uses idempotent ADD COLUMN IF NOT EXISTS for every new column', () => {
    // Count actual ALTER ... ADD COLUMN statements (the header comment also
    // mentions the phrase). Exactly 9 new dormant columns land.
    const adds = src.match(/ALTER TABLE \w+ ADD COLUMN IF NOT EXISTS/g)
    expect(adds).toHaveLength(9)
  })

  it('reuses existing estimates.discount_* columns — adds NO new estimates.discount', () => {
    // estimate_items.discount is allowed; a NEW estimates.discount would appear
    // in the estimates ALTER block. Assert that block has no discount add.
    const estimatesBlock = src.slice(src.indexOf('-- estimates:'), src.indexOf('-- companies:'))
    expect(estimatesBlock).not.toMatch(/ADD COLUMN IF NOT EXISTS discount\b/)
  })

  it('has a named tax_category CHECK constraint, idempotent', () => {
    expect(src.match(/estimate_items_tax_category_check/g)).toHaveLength(2)
    expect(src).toContain(
      "CHECK (tax_category IS NULL OR tax_category IN ('labor', 'materials', 'other'))",
    )
  })
})
