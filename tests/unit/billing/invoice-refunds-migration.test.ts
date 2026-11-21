import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Static SQL contract for the invoices refund columns migration (pure file
 * read, no database). Line endings normalized.
 */
const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261121160000_invoice_refunds.sql'),
  'utf8',
).replace(/\r\n/g, '\n')

describe('invoice refunds migration', () => {
  it('adds refunded_cents as a non-negative NOT NULL integer defaulting to 0, idempotently', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.invoices\s+ADD COLUMN IF NOT EXISTS refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK \(refunded_cents >= 0\);/,
    )
  })

  it('adds a nullable refunded_at timestamp idempotently', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.invoices\s+ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;/,
    )
    expect(sql).not.toMatch(/refunded_at TIMESTAMPTZ\s+NOT NULL/)
  })

  it('documents both columns', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN public\.invoices\.refunded_cents IS/)
    expect(sql).toMatch(/COMMENT ON COLUMN public\.invoices\.refunded_at IS/)
  })

  it('does not touch status or backfill rows', () => {
    expect(sql).not.toMatch(/\bUPDATE public\.invoices\b/)
    expect(sql).not.toMatch(/SET status/i)
  })

  it('reloads the PostgREST schema and says to apply by hand to both databases', () => {
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema';/)
    expect(sql).toMatch(/APPLY BY HAND to BOTH databases/)
  })
})
