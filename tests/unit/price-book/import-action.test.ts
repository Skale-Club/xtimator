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
    const helper = makeSupabase({
      claims: null,
      company: null,
      existing: [],
      insertResult: { error: null },
    })
    vi.mocked(createClient).mockResolvedValue(helper.client as any)

    const result = await importPriceBookItems([sampleRow])
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns No company found error when companies query returns null', async () => {
    const helper = makeSupabase({
      claims: { sub: 'user-1' },
      company: null,
      existing: [],
      insertResult: { error: null },
    })
    vi.mocked(createClient).mockResolvedValue(helper.client as any)

    const result = await importPriceBookItems([sampleRow])
    expect(result).toEqual({ error: 'No company found' })
  })

  it('returns error when called with an empty rows array', async () => {
    const helper = makeSupabase({
      claims: { sub: 'user-1' },
      company: { id: 'company-123' },
      existing: [],
      insertResult: { error: null },
    })
    vi.mocked(createClient).mockResolvedValue(helper.client as any)

    const result = await importPriceBookItems([])
    expect(result).toEqual({ error: 'No valid rows to import.' })
  })

  it('fetches existing (category, name) pairs scoped to the company', async () => {
    const helper = makeSupabase({
      claims: { sub: 'user-1' },
      company: { id: 'company-123' },
      existing: [],
      insertResult: { error: null },
    })
    vi.mocked(createClient).mockResolvedValue(helper.client as any)

    await importPriceBookItems([sampleRow])

    expect(helper.spies.existingEq).toHaveBeenCalledWith('company_id', 'company-123')
  })

  it('calls supabase.insert with an array of rows (single bulk call)', async () => {
    const helper = makeSupabase({
      claims: { sub: 'user-1' },
      company: { id: 'company-123' },
      existing: [],
      insertResult: { error: null },
    })
    vi.mocked(createClient).mockResolvedValue(helper.client as any)

    await importPriceBookItems([sampleRow])

    expect(helper.spies.insert).toHaveBeenCalledTimes(1)
    const insertArg = helper.spies.insert.mock.calls[0][0]
    expect(Array.isArray(insertArg)).toBe(true)
  })

  it('insert payload uses null (not empty string) for blank unit and notes', async () => {
    const helper = makeSupabase({
      claims: { sub: 'user-1' },
      company: { id: 'company-123' },
      existing: [],
      insertResult: { error: null },
    })
    vi.mocked(createClient).mockResolvedValue(helper.client as any)

    const rowWithBlanks: PriceBookItemFormValues = {
      category: 'Labor',
      name: 'General Labor',
      unit: '',
      unit_price: 75,
      notes: '',
    }
    await importPriceBookItems([rowWithBlanks])

    const insertArg = helper.spies.insert.mock.calls[0][0]
    expect(insertArg[0].unit).toBeNull()
    expect(insertArg[0].notes).toBeNull()
  })

  it('skips duplicates against existing rows (case-insensitive) and returns skipped count', async () => {
    const helper = makeSupabase({
      claims: { sub: 'user-1' },
      company: { id: 'company-123' },
      existing: [{ category: 'Labor', name: 'General Labor' }],
      insertResult: { error: null },
    })
    vi.mocked(createClient).mockResolvedValue(helper.client as any)

    const result = await importPriceBookItems([
      { category: 'Labor', name: 'General Labor', unit: 'hr', unit_price: 75, notes: '' },
      { category: 'Materials', name: 'PVC Pipe 2in', unit: 'ft', unit_price: 3.5, notes: '' },
    ])

    expect(result).toEqual({ data: { imported: 1, skipped: 1 } })
    expect(helper.spies.insert).toHaveBeenCalledTimes(1)
    const insertArg = helper.spies.insert.mock.calls[0][0]
    expect(Array.isArray(insertArg)).toBe(true)
    expect(insertArg).toHaveLength(1)
    expect(insertArg[0].name).toBe('PVC Pipe 2in')
  })

  it('surfaces a friendly error when supabase insert fails', async () => {
    const helper = makeSupabase({
      claims: { sub: 'user-1' },
      company: { id: 'company-123' },
      existing: [],
      insertResult: { error: { message: 'pg error' } },
    })
    vi.mocked(createClient).mockResolvedValue(helper.client as any)

    const result = await importPriceBookItems([sampleRow])
    expect(result).toEqual({ error: 'Failed to import items. Please try again.' })
  })
})
