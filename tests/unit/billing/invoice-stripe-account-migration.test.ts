import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Static SQL contract for the invoices.stripe_account_id migration (pure file
 * read, no database). Line endings normalized.
 */
const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261121150000_invoice_stripe_account.sql'),
  'utf8',
).replace(/\r\n/g, '\n')

describe('invoice stripe_account_id migration', () => {
  it('adds a nullable TEXT column idempotently with no NOT NULL and no backfill', () => {
    expect(sql).toMatch(/ALTER TABLE public\.invoices\s+ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;/)
    expect(sql).not.toMatch(/stripe_account_id TEXT\s+NOT NULL/)
    expect(sql).not.toMatch(/\bUPDATE public\.invoices\b/)
  })

  it('documents the column', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN public\.invoices\.stripe_account_id IS/)
  })

  it('adds a partial index idempotently', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_invoices_stripe_account_id\s+ON public\.invoices \(stripe_account_id\)\s+WHERE stripe_account_id IS NOT NULL;/,
    )
  })

  it('reloads the PostgREST schema and says to apply by hand to both databases', () => {
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema';/)
    expect(sql).toMatch(/APPLY BY HAND to BOTH databases/)
  })
})
