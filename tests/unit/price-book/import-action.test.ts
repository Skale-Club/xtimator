import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { importPriceBookItems } from '@/lib/actions/price-book'
import type { PriceBookItemFormValues } from '@/lib/schemas/price-book'

// Helper: build a chainable supabase mock with predictable returns per call
function makeSupabase(opts: {
  claims: { sub: string } | null
  company: { id: string } | null
  existing: { category: string; name: string }[]
  insertResult: { error: { message: string } | null }
}) {
  const companyChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: opts.company }),
  }
  const existingChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: opts.existing, error: null }),
  }
  const insertSpy = vi.fn().mockResolvedValue(opts.insertResult)
  const insertChain = { insert: insertSpy }

  let priceBookCalls = 0
  return {
    spies: { insert: insertSpy, existingEq: existingChain.eq },
    client: {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: opts.claims ? { claims: opts.claims } : null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'companies') return companyChain
        if (table === 'company_price_book') {
          priceBookCalls++
          return priceBookCalls === 1 ? existingChain : insertChain
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    },
  }
}

const sampleRow: PriceBookItemFormValues = {
  category: 'Labor',
  name: 'General Labor',
  unit: 'hr',
  unit_price: 75,
  notes: '',
}

describe('importPriceBookItems', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('returns Not authenticated error when there is no session', async () => {
    expect.fail('not implemented')
  })

  it('returns No company found error when companies query returns null', async () => {
    expect.fail('not implemented')
  })

  it('returns error when called with an empty rows array', async () => {
    expect.fail('not implemented')
  })

  it('fetches existing (category, name) pairs scoped to the company', async () => {
    expect.fail('not implemented')
  })

  it('calls supabase.insert with an array of rows (single bulk call)', async () => {
    expect.fail('not implemented')
  })

  it('insert payload uses null (not empty string) for blank unit and notes', async () => {
    expect.fail('not implemented')
  })

  it('skips duplicates against existing rows (case-insensitive) and returns skipped count', async () => {
    expect.fail('not implemented')
  })

  it('surfaces a friendly error when supabase insert fails', async () => {
    expect.fail('not implemented')
  })
})

// Suppress unused-variable warnings for Wave 0 — these helpers will be used in Wave 1 bodies
void makeSupabase
void sampleRow
void importPriceBookItems
