import { describe, expect, it, vi } from 'vitest'
import type { EstimateSectionOutput, LineItemOutput } from '@/lib/ai/types'
import {
  HISTORY_WINDOW,
  applyCompanyHistory,
  buildHistoryIndex,
  forgetEstimatePrices,
  historyCandidateKeys,
  loadCompanyHistory,
  median,
  recordAcceptedEstimatePrices,
} from '@/lib/estimate/pricing/company-history'
import { conceptKey, conceptMapKey, priceConcept } from '@/lib/estimate/pricing/concept-key'

// SEED-057 Phase E (decision E3): the company's own accepted prices.

vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))

const obs = (description: string, unit: string, price: number, day: number) => {
  const c = priceConcept(description, unit)
  return { concept_key: c.key, unit: c.unit, unit_price: price, observed_at: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z` }
}

const line = (over: Partial<LineItemOutput>): LineItemOutput => ({
  description: 'Paint walls',
  quantity: 100,
  unit: 'sq ft',
  unit_price: 1.5,
  price_source: 'ai_estimate',
  ...over,
})
const sections = (...items: LineItemOutput[]): EstimateSectionOutput[] => [{ title: 'Walls', items }]

describe('median', () => {
  it('odd, even, single', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([7])).toBe(7)
  })
})

describe('buildHistoryIndex', () => {
  it('uses the median of the LAST 10 observations only', () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => obs('Paint walls', 'sq ft', 100, i + 1)), // old, outliers
      ...Array.from({ length: HISTORY_WINDOW }, (_, i) => obs('Paint walls', 'sq ft', 2, i + 10)),
    ]
    const hit = buildHistoryIndex(rows).get(conceptMapKey(priceConcept('Paint walls', 'sq ft')))!
    expect(hit.unit_price).toBe(2)
    expect(hit.samples).toBe(HISTORY_WINDOW)
  })

  it('keeps concepts and units apart', () => {
    const idx = buildHistoryIndex([obs('Paint walls', 'sq ft', 2, 1), obs('Paint walls', 'job', 500, 2), obs('Paint ceiling', 'sq ft', 3, 3)])
    expect(idx.size).toBe(3)
  })

  it('ignores rows without a positive finite price', () => {
    const rows = [obs('Paint walls', 'sq ft', 0, 1), obs('Paint walls', 'sq ft', -4, 2), { ...obs('Paint walls', 'sq ft', 2, 3), unit_price: Number.NaN }]
    expect(buildHistoryIndex(rows).size).toBe(0)
  })
})

describe('applyCompanyHistory (precedence: price book > history > researched > model)', () => {
  const index = buildHistoryIndex([obs('Paint walls', 'sq ft', 2.25, 1), obs('Paint walls', 'sq ft', 2.25, 2), obs('Install toilet', 'each', 310, 3), obs('Install toilet', 'each', 310, 4)])

  it('re-prices a model-estimated line and tags it company_history', () => {
    const out = applyCompanyHistory(sections(line({})), index)
    expect(out.applied).toBe(1)
    expect(out.sections[0].items[0]).toMatchObject({ unit_price: 2.25, price_source: 'company_history', quantity: 100 })
  })

  it('matches by concept, not wording', () => {
    const out = applyCompanyHistory(sections(line({ description: 'Toilet installation', unit: 'each', quantity: 1, unit_price: 400 })), index)
    expect(out.sections[0].items[0]).toMatchObject({ unit_price: 310, price_source: 'company_history' })
  })

  it('never overrides a price-book, researched or owner-edited price', () => {
    const items = [
      line({ price_source: 'price_book', unit_price: 9 }),
      line({ price_source: 'researched', unit_price: 8 }),
      line({ price_source: null as never, unit_price: 7 }),
    ]
    const out = applyCompanyHistory(sections(...items), index)
    expect(out.applied).toBe(0)
    expect(out.sections[0].items.map((i) => i.unit_price)).toEqual([9, 8, 7])
    // Nothing applied: the very same array comes back.
    expect(out.sections).toEqual(sections(...items))
  })

  it('a line priced at $0 (included / free) is never re-priced', () => {
    const idx = buildHistoryIndex([obs('Cleanup', 'job', 45, 1), obs('Cleanup', 'job', 45, 2)])
    const out = applyCompanyHistory(sections(line({ description: 'Cleanup (included)', unit: 'job', unit_price: 0 })), idx)
    expect(out.applied).toBe(0)
    expect(out.sections[0].items[0]).toMatchObject({ unit_price: 0, price_source: 'ai_estimate' })
    expect(applyCompanyHistory(sections(line({ description: 'Cleanup', unit: 'job', unit_price: 0 })), idx).applied).toBe(0)
  })

  it('needs two observations: one accepted job is not history', () => {
    const single = buildHistoryIndex([obs('Paint walls', 'sq ft', 2.25, 1)])
    expect(applyCompanyHistory(sections(line({})), single).applied).toBe(0)
  })

  it('only replaces a price within 0.33x-3x of the model price (a 10x gap is a collision, not a bargain)', () => {
    const idx = buildHistoryIndex([obs('Paint walls', 'sq ft', 30, 1), obs('Paint walls', 'sq ft', 30, 2)])
    expect(applyCompanyHistory(sections(line({ unit_price: 1.5 })), idx).applied).toBe(0) // 20x
    expect(applyCompanyHistory(sections(line({ unit_price: 100 })), idx).applied).toBe(0) // 0.3x
  })

  it('applies at the edges of the band', () => {
    const idx = buildHistoryIndex([obs('Paint walls', 'sq ft', 3, 1), obs('Paint walls', 'sq ft', 3, 2)])
    expect(applyCompanyHistory(sections(line({ unit_price: 1 })), idx).applied).toBe(1) // 3x
    expect(applyCompanyHistory(sections(line({ unit_price: 9 })), idx).applied).toBe(1) // 0.333x
    expect(applyCompanyHistory(sections(line({ unit_price: 0.5 })), idx).applied).toBe(0) // 6x
    expect(applyCompanyHistory(sections(line({ unit_price: 10 })), idx).applied).toBe(0) // 0.3x
  })

  it('does not apply across units', () => {
    const out = applyCompanyHistory(sections(line({ unit: 'job' })), index)
    expect(out.applied).toBe(0)
  })

  it('an empty index is a no-op that returns the input untouched', () => {
    const input = sections(line({}))
    expect(applyCompanyHistory(input, new Map()).sections).toBe(input)
  })
})

describe('historyCandidateKeys', () => {
  it('only asks about lines the model priced itself', () => {
    const keys = historyCandidateKeys(
      sections(line({}), line({ description: 'Book line', price_source: 'price_book' }), line({ description: 'Install toilet', unit: 'each' })),
    )
    expect(keys.sort()).toEqual([conceptKey('Paint walls'), conceptKey('Install toilet')].sort())
  })
})

function queryChain(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {}
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) {
    chain[m] = vi.fn((...args: unknown[]) => {
      calls[m] = args
      return chain
    })
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return { chain, calls }
}

describe('loadCompanyHistory', () => {
  it('queries the tenant, currency and the candidate concepts', async () => {
    const { chain, calls } = queryChain({ data: [obs('Paint walls', 'sq ft', 2, 1)], error: null })
    const supabase = { from: vi.fn().mockReturnValue(chain) }
    const idx = await loadCompanyHistory(supabase as never, 'co-1', 'USD', [conceptKey('Paint walls')])
    expect(supabase.from).toHaveBeenCalledWith('price_observations')
    expect(calls.in).toEqual(['concept_key', [conceptKey('Paint walls')]])
    expect(idx.size).toBe(1)
  })

  it('skips the query when there is nothing to ask', async () => {
    const supabase = { from: vi.fn() }
    expect((await loadCompanyHistory(supabase as never, 'co-1', 'USD', [])).size).toBe(0)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('a missing table (migration not applied) or any failure is "no history", never a throw', async () => {
    const missing = { from: vi.fn().mockReturnValue(queryChain({ data: null, error: { code: '42P01', message: 'relation "price_observations" does not exist' } }).chain) }
    expect((await loadCompanyHistory(missing as never, 'co-1', 'USD', ['x'])).size).toBe(0)
    const exploding = { from: vi.fn(() => { throw new Error('boom') }) }
    expect((await loadCompanyHistory(exploding as never, 'co-1', 'USD', ['x'])).size).toBe(0)
  })
})

describe('recordAcceptedEstimatePrices', () => {
  const estimateRow = (over: Record<string, unknown> = {}) => ({
    company_id: 'co-1',
    currency_code: 'USD',
    client_response: 'accepted',
    sections: [
      {
        items: [
          { description: 'Paint walls', unit: 'sq ft', unit_price: 2, quantity: 100 },
          { description: 'Walls painting', unit: 'sqft', unit_price: 4, quantity: 50 },
          { description: 'Install toilet', unit: 'each', unit_price: 300, quantity: 1 },
          { description: 'Free inspection', unit: 'job', unit_price: 0, quantity: 1 },
          { description: 'Zero qty', unit: 'each', unit_price: 10, quantity: 0 },
        ],
      },
    ],
    ...over,
  })

  function fakeClient(row: unknown, upsertError: unknown = null, afterResponse: string | null = 'accepted') {
    const upsert = vi.fn().mockResolvedValue({ error: upsertError })
    const del = vi.fn().mockResolvedValue({ error: null })
    let reads = 0
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'estimates') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: reads++ === 0 ? row : { client_response: afterResponse },
                  error: null,
                }),
              }),
            }),
          }
        }
        return { upsert, delete: () => ({ eq: del }) }
      }),
    }
    return { client: client as never, upsert, del }
  }

  it('files one observation per concept + unit, averaging repeats, skipping unpriced lines', async () => {
    const { client, upsert } = fakeClient(estimateRow())
    const out = await recordAcceptedEstimatePrices('est-1', client)

    expect(out.recorded).toBe(2)
    const [rows, opts] = upsert.mock.calls[0]
    expect(opts).toEqual({ onConflict: 'estimate_id,concept_key,unit', ignoreDuplicates: true })
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ company_id: 'co-1', estimate_id: 'est-1', concept_key: conceptKey('Paint walls'), unit: 'sq ft', unit_price: 3, source: 'accepted_estimate', currency_code: 'USD' }),
        expect.objectContaining({ concept_key: conceptKey('Install toilet'), unit: 'each', unit_price: 300 }),
      ]),
    )
  })

  it('withdraws what it filed when the acceptance was undone while it ran', async () => {
    const { client, upsert, del } = fakeClient(estimateRow(), null, null)
    expect((await recordAcceptedEstimatePrices('est-1', client)).recorded).toBe(0)
    expect(upsert).toHaveBeenCalled()
    expect(del).toHaveBeenCalledWith('estimate_id', 'est-1')
  })

  it('keeps the rows when it is still accepted afterwards', async () => {
    const { client, del } = fakeClient(estimateRow())
    expect((await recordAcceptedEstimatePrices('est-1', client)).recorded).toBe(2)
    expect(del).not.toHaveBeenCalled()
  })

  it('records ACCEPTED estimates only', async () => {
    for (const response of [null, 'declined']) {
      const { client, upsert } = fakeClient(estimateRow({ client_response: response }))
      expect((await recordAcceptedEstimatePrices('est-1', client)).recorded).toBe(0)
      expect(upsert).not.toHaveBeenCalled()
    }
  })

  it('a missing price_observations table is swallowed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = fakeClient(estimateRow(), { message: 'relation "price_observations" does not exist' })
    await expect(recordAcceptedEstimatePrices('est-1', client)).resolves.toEqual({ recorded: 0 })
    warn.mockRestore()
  })

  it('never throws, whatever breaks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = { from: () => { throw new Error('db down') } } as never
    await expect(recordAcceptedEstimatePrices('est-1', client)).resolves.toEqual({ recorded: 0 })
    warn.mockRestore()
  })
})

describe('forgetEstimatePrices', () => {
  it('withdraws the estimate observations, and never throws', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn(() => ({ delete: () => ({ eq }) })) } as never
    await forgetEstimatePrices('est-1', client)
    expect(eq).toHaveBeenCalledWith('estimate_id', 'est-1')
    await expect(forgetEstimatePrices('est-1', { from: () => { throw new Error('x') } } as never)).resolves.toBeUndefined()
  })
})
