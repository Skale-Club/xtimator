import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261117000002_change_order_invoices.sql'),
  'utf8',
)

describe('migration 20261117000002_change_order_invoices', () => {
  it('adds the nullable change_order_id link and widens the kind check', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS change_order_id uuid\s+REFERENCES public\.change_orders\(id\)/)
    expect(sql).toMatch(/CHECK \(kind IN \('deposit', 'balance', 'full', 'change_order'\)\)/)
  })

  it('pairs the change_order kind with its change order, both ways', () => {
    expect(sql).toMatch(/CHECK \(\(kind = 'change_order'\) = \(change_order_id IS NOT NULL\)\)/)
  })

  it('allows only one live invoice per change order (void ones do not count)', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_live_per_change_order[\s\S]*WHERE change_order_id IS NOT NULL AND status IN \('draft', 'open', 'paid'\)/,
    )
  })

  it('is additive only and reloads the PostgREST schema cache', () => {
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN)/i)
    expect(sql).not.toMatch(/\b(DELETE FROM|TRUNCATE|UPDATE public\.invoices)\b/i)
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema';/)
  })
})
