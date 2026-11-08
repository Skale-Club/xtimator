import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const mockRefineEstimate = vi.fn()
const mockResolve = vi.fn()

vi.mock('@/lib/ai/provider-with-fallback', () => ({
  getAIProviderWithFallback: vi.fn(async () => ({
    refineEstimate: (...a: unknown[]) => mockRefineEstimate(...a),
  })),
}))
vi.mock('@/lib/queries/price-book', () => ({
  getPriceBookItems: vi.fn(async () => [
    { folder_name: null, name: 'Paint walls', unit: 'sq ft', unit_price: 2, currency_code: 'USD' },
    { folder_name: null, name: 'Euro item', unit: null, unit_price: 5, currency_code: 'EUR' },
  ]),
}))
vi.mock('@/lib/estimate/pricing/resolve-prices', () => ({
  resolveLinePrices: (...a: unknown[]) => mockResolve(...a),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            table === 'companies'
              ? { data: { industry: 'painting', currency_code: 'USD', default_estimate_language: 'en' } }
              : { data: { client: { city: 'Austin', state: 'TX' } } },
        }),
      }),
    }),
  }),
}))

import { makeRefineNode } from '@/lib/estimate/graph/nodes/refine'

const runner = { run: <T>(_n: string, fn: () => Promise<T>) => fn() }

const item = (over: Record<string, unknown>) => ({
  description: 'Paint walls',
  quantity: 100,
  unit: 'sq ft',
  unit_price: 3.25,
  price_source: 'ai_estimate' as const,
  ...over,
})

const existing = {
  suggested_project_name: 'P',
  suggested_client_name: null,
  summary: 'S',
  sections: [{ title: 'Walls', items: [item({ price_source: 'ai_estimate' }), item({ description: 'Trim', unit_price: 40, quantity: 1 })] }],
}

const state = {
  companyId: 'c1',
  projectId: 'p1',
  channel: 'web' as const,
  existingEstimate: existing,
  instruction: 'add a ceiling line',
  attemptId: 'attempt-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  // identity resolver that re-prices everything it is given to 99 / researched
  mockResolve.mockImplementation(async (sections: Array<{ items: Array<Record<string, unknown>> }>) => ({
    sections: sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, unit_price: 99, price_source: 'researched' })) })),
  }))
})

describe('refine node price guardrails', () => {
  it('re-prices NEW and CHANGED lines only; unchanged lines keep their price and source', async () => {
    mockRefineEstimate.mockResolvedValue({
      ...existing,
      sections: [
        {
          title: 'Walls',
          items: [
            item({ price_source: 'price_book' }), // unchanged (model echoed a different label)
            item({ description: 'Trim', unit_price: 55, quantity: 1 }), // changed price
            item({ description: 'Ceiling paint', unit_price: 1, quantity: 50 }), // new
          ],
        },
      ],
    })
    const out = (await makeRefineNode(runner)(state as never)) as { refined: typeof existing }
    const items = out.refined.sections[0].items
    expect(items[0]).toMatchObject({ unit_price: 3.25, price_source: 'ai_estimate' })
    expect(items[1]).toMatchObject({ description: 'Trim', unit_price: 99, price_source: 'researched' })
    expect(items[2]).toMatchObject({ description: 'Ceiling paint', unit_price: 99 })

    const [sent, opts] = mockResolve.mock.calls[0] as [Array<{ items: Array<{ description: string }> }>, Record<string, unknown>]
    expect(sent[0].items.map((i) => i.description)).toEqual(['Trim', 'Ceiling paint'])
    expect(opts).toMatchObject({
      companyId: 'c1',
      attemptId: 'attempt-1',
      projectId: 'p1',
      currencyCode: 'USD',
      region: { city: 'Austin', state: 'TX' },
    })
    // currency-filtered price book
    expect(opts.priceBookItems).toEqual([{ folder_name: null, name: 'Paint walls', unit: 'sq ft', unit_price: 2, currency_code: 'USD' }])
    expect(opts.totalCeiling).toBeUndefined()
  })

  it('passes the price-book pricing fields and the trade playbook to the pipeline', async () => {
    mockRefineEstimate.mockResolvedValue({
      ...existing,
      sections: [{ title: 'Walls', items: [item({ description: 'Ceiling paint', unit_price: 1, quantity: 50 })] }],
    })
    await makeRefineNode(runner)(state as never)
    const opts = mockResolve.mock.calls[0][1] as { priceBookItems: Array<Record<string, unknown>>; playbook: unknown }
    // getPriceBookItems mock rows carry no pricing fields: they come through as absent, and the
    // keys exist so a real area_based row would reach anchoring.
    expect(opts.priceBookItems[0]).toHaveProperty('pricing_type')
    expect(opts.priceBookItems[0]).toHaveProperty('price_per_unit')
    expect(opts.priceBookItems[0]).toHaveProperty('minimum_price')
    expect(opts.playbook).toBeTruthy()
  })

  it('does not call the pipeline when every line is unchanged', async () => {
    mockRefineEstimate.mockResolvedValue({ ...existing, summary: 'Better summary' })
    const out = (await makeRefineNode(runner)(state as never)) as { refined: typeof existing }
    expect(mockResolve).not.toHaveBeenCalled()
    expect(out.refined.summary).toBe('Better summary')
  })

  it('a pipeline failure keeps the model output (never throws)', async () => {
    mockResolve.mockRejectedValue(new Error('boom'))
    const refined = { ...existing, sections: [{ title: 'Walls', items: [item({ description: 'New', unit_price: 1 })] }] }
    mockRefineEstimate.mockResolvedValue(refined)
    const out = (await makeRefineNode(runner)(state as never)) as { refined: unknown; failure?: unknown }
    expect(out.failure).toBeUndefined()
    expect(out.refined).toEqual(refined)
  })

  it('uses the estimate language (state), not the company default', async () => {
    mockRefineEstimate.mockResolvedValue(existing)
    await makeRefineNode(runner)({ ...state, estimateLanguage: 'pt' } as never)
    expect(mockRefineEstimate.mock.calls[0][0].language).toBe('pt')

    mockRefineEstimate.mockClear()
    await makeRefineNode(runner)(state as never)
    expect(mockRefineEstimate.mock.calls[0][0].language).toBe('en') // company default only as fallback
  })
})
