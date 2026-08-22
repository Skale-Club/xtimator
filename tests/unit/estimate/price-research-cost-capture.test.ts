import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Fix (price-research cost attribution) — HIGH: prod carries 374
 * `price_researched` usage events and ZERO `ai_cost_events` rows for
 * `price_research` — the orchestrator's comment claiming the cost was
 * "captured by recordAICost at the OpenRouter-web call" was false; no such
 * call existed.
 *
 * This locks the two load-bearing halves of the fix:
 *   1. The OpenRouter-web adapter's `lookup()` now records the real spend via
 *      `recordAICost({ operationType: 'price_research', ... })`, tagged with
 *      the caller's OWN price-research attemptId (not the generation's).
 *   2. The orchestrator's debit read-back queries `ai_cost_events` filtered
 *      to `.eq('attempt_id', <price-research's own id>)` AND
 *      `.eq('operation_type', 'price_research')` — never the generation's
 *      `ctx.attemptId` (which the 'estimate' op already owns) and never
 *      unfiltered by op — and reads ONCE (no retry/sleep): a miss yields
 *      `realCostUsd: null` on the first read, immediately.
 *
 * Placeholder credentials only — gitleaks-safe.
 */

const { getIntegrationKey, getOpenRouterDefaultModel, createServiceClient, requireServiceClient } =
  vi.hoisted(() => ({
    getIntegrationKey: vi.fn(async () => 'sk-test-or-placeholder' as string | null),
    getOpenRouterDefaultModel: vi.fn(async () => 'anthropic/claude-sonnet-4' as string | null),
    createServiceClient: vi.fn(),
    requireServiceClient: vi.fn(),
  }))
const mockRecordAICost = vi.fn()
const mockRecordCreditDebit = vi.fn()

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey,
  getOpenRouterDefaultModel,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient,
  requireServiceClient,
}))
vi.mock('@/lib/billing/record-ai-cost', () => ({
  recordAICost: (...args: unknown[]) => mockRecordAICost(...args),
}))
vi.mock('@/lib/billing/credit-ledger', () => ({
  recordCreditDebit: (...args: unknown[]) => mockRecordCreditDebit(...args),
}))
vi.mock('@/lib/estimate/price-research/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/estimate/price-research/provider')>()
  return { ...actual, getPriceResearchProviderChain: vi.fn(), isUsableCandidate: vi.fn() }
})
vi.mock('@/lib/estimate/price-research/cache', () => ({
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
}))
vi.mock('@/lib/quota', () => ({
  checkQuota: vi.fn(async () => ({ allowed: true, remaining: 10 })),
  recordUsage: vi.fn(async () => undefined),
}))

import { makeOpenRouterWebProvider } from '@/lib/estimate/price-research/adapters/openrouter-web'
import { getPriceResearchProviderChain, isUsableCandidate } from '@/lib/estimate/price-research/provider'
import { researchUnmatchedPrices, type ResearchContext } from '@/lib/estimate/price-research/orchestrator'
import type { EstimateSectionOutput, LineItemOutput } from '@/lib/ai/types'

function mockEngineRow(metadata: Record<string, unknown> | null) {
  const query: Record<string, unknown> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.maybeSingle = vi.fn(async () => ({
    data: metadata ? { metadata } : null,
    error: null,
  }))
  const from = vi.fn(() => query)
  createServiceClient.mockReturnValue({ from } as never)
  return { from }
}

function orResponse(content: string, annotations: unknown[] = [], cost: number | null = 0.012) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content, annotations } }],
      usage: { server_tool_use: { web_search_requests: 1 }, ...(cost != null ? { cost } : {}) },
    }),
    text: async () => '',
  }
}

const region = { city: 'Austin', state: 'TX' }

beforeEach(() => {
  vi.clearAllMocks()
  getIntegrationKey.mockResolvedValue('sk-test-or-placeholder')
  getOpenRouterDefaultModel.mockResolvedValue('anthropic/claude-sonnet-4')
  mockEngineRow(null)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('Fix (price-research cost attribution): openrouter-web adapter records recordAICost', () => {
  it('requests usage.include and records ONE recordAICost row with operationType price_research + the caller\'s attemptId + the real cost', async () => {
    const content = JSON.stringify({
      results: [{ name: 'Drywall repair', unit_price: 150, currency: 'USD', source_url: null, snippet: null }],
    })
    const fetchMock = vi.fn(async () => orResponse(content, [], 0.0123) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    await makeOpenRouterWebProvider().lookup(
      [{ name: 'Drywall repair' }],
      region,
      'USD',
      { attemptId: 'research-attempt-77', companyId: 'company-1', projectId: 'proj-1' }
    )

    // The request opted into the real upstream USD cost.
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.usage).toEqual({ include: true })

    expect(mockRecordAICost).toHaveBeenCalledOnce()
    expect(mockRecordAICost).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'research-attempt-77',
        operationType: 'price_research',
        provider: 'openrouter',
        realCostUsd: 0.0123,
        companyId: 'company-1',
        projectId: 'proj-1',
      })
    )
  })

  it('realCostUsd is null (never guessed at 0) when usage.cost is absent', async () => {
    const content = JSON.stringify({ results: [] })
    const fetchMock = vi.fn(async () => orResponse(content, [], null) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    await makeOpenRouterWebProvider().lookup(
      [{ name: 'Drywall repair' }],
      region,
      'USD',
      { attemptId: 'research-attempt-1' }
    )

    expect(mockRecordAICost).toHaveBeenCalledWith(
      expect.objectContaining({ realCostUsd: null, operationType: 'price_research' })
    )
  })

  it('an absent costContext still records (a fresh random attemptId), matching the pre-fix cost-capture-always fallback', async () => {
    const content = JSON.stringify({ results: [] })
    const fetchMock = vi.fn(async () => orResponse(content, [], 0.02) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    await makeOpenRouterWebProvider().lookup([{ name: 'Drywall repair' }], region, 'USD')

    expect(mockRecordAICost).toHaveBeenCalledOnce()
    const arg = mockRecordAICost.mock.calls[0][0] as { attemptId: string; companyId: string | null }
    expect(typeof arg.attemptId).toBe('string')
    expect(arg.attemptId.length).toBeGreaterThan(0)
    expect(arg.companyId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Orchestrator half of the fix: the debit read-back's key + filter + no-retry.
// ---------------------------------------------------------------------------

const supabaseFrom = vi.fn()
const supabase = { from: supabaseFrom } as unknown as ResearchContext['supabase']

function ctx(overrides: Partial<ResearchContext> = {}): ResearchContext {
  return {
    companyId: 'company-1',
    region: { city: 'Austin', state: 'TX' },
    currency: 'USD',
    supabase,
    attemptId: 'GENERATION-attempt-1', // the generation's OWN attemptId — must NOT be the debit's key
    ...overrides,
  }
}

function item(partial: Partial<LineItemOutput> & { price_source: LineItemOutput['price_source'] }): LineItemOutput {
  return {
    description: partial.description ?? 'Some service',
    quantity: partial.quantity ?? 1,
    unit_price: partial.unit_price ?? 0,
    price_source: partial.price_source,
    ...(partial.unit ? { unit: partial.unit } : {}),
  }
}

function section(title: string, items: LineItemOutput[]): EstimateSectionOutput {
  return { title, items }
}

function usable(name: string, unit_price: number) {
  return {
    name,
    unit_price,
    currency: 'USD',
    source_url: 'https://example.test/source',
    snippet: 'a real cited snippet',
    confidence: 0.8,
  }
}

describe('Fix (price-research cost attribution): orchestrator debit read-back', () => {
  beforeEach(() => {
    vi.mocked(isUsableCandidate).mockReturnValue(true)
  })

  it('reads back ai_cost_events keyed on the RESEARCH pass\'s own attemptId (never ctx.attemptId) filtered to operation_type price_research, and debits once', async () => {
    const eqCalls: Array<[string, unknown]> = []
    supabaseFrom.mockImplementation((table: string) => {
      if (table !== 'ai_cost_events') return { select: () => ({ eq: () => ({}) }) }
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (...args: [string, unknown]) => {
        eqCalls.push(args)
        return chain
      }
      // Resolve when awaited (both .eq() calls chained onto this same object).
      ;(chain as { then: PromiseLike<unknown>['then'] }).then = (resolve) =>
        Promise.resolve({ data: [{ real_cost_usd: 0.02 }, { real_cost_usd: 0.03 }] }).then(
          resolve as never
        )
      return chain
    })

    const lookup = vi.fn().mockResolvedValue([usable('Drywall repair', 175)])
    vi.mocked(getPriceResearchProviderChain).mockResolvedValue([{ lookup }] as never)

    const sections = [
      section('Work', [item({ description: 'Drywall repair', unit_price: 0, price_source: 'ai_estimate' })]),
    ]

    await researchUnmatchedPrices(sections, ctx({ attemptId: 'GENERATION-attempt-1' }))

    // provider.lookup received a costContext carrying the RESEARCH pass's own
    // attemptId — distinct from ctx.attemptId (asserted below via the debit).
    expect(lookup).toHaveBeenCalledOnce()
    const lookupCostContext = lookup.mock.calls[0][3] as { attemptId?: string } | undefined
    expect(lookupCostContext?.attemptId).toBeDefined()
    expect(lookupCostContext?.attemptId).not.toBe('GENERATION-attempt-1')

    // The read-back filtered on operation_type = 'price_research' (never unfiltered).
    const opFilter = eqCalls.find(([col]) => col === 'operation_type')
    expect(opFilter?.[1]).toBe('price_research')

    // The read-back's attempt_id filter is the RESEARCH pass's own id, NOT
    // ctx.attemptId — the exact bug: previously this summed the GENERATION's
    // own 'estimate' cost row into the price_research debit.
    const attemptFilter = eqCalls.find(([col]) => col === 'attempt_id')
    expect(attemptFilter?.[1]).toBeDefined()
    expect(attemptFilter?.[1]).not.toBe('GENERATION-attempt-1')
    expect(attemptFilter?.[1]).toBe(lookupCostContext?.attemptId)

    // Debited once, summing ONLY the rows this filtered read-back returned.
    expect(mockRecordCreditDebit).toHaveBeenCalledOnce()
    expect(mockRecordCreditDebit).toHaveBeenCalledWith({
      companyId: 'company-1',
      operationType: 'price_research',
      realCostUsd: 0.05,
      attemptId: lookupCostContext?.attemptId,
    })
  })

  it('a miss (no ai_cost_events rows) on the FIRST read yields realCostUsd: null with NO retry/sleep', async () => {
    let readCount = 0
    supabaseFrom.mockImplementation((table: string) => {
      if (table !== 'ai_cost_events') return { select: () => ({ eq: () => ({}) }) }
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      ;(chain as { then: PromiseLike<unknown>['then'] }).then = (resolve) => {
        readCount++
        return Promise.resolve({ data: [] }).then(resolve as never)
      }
      return chain
    })

    const lookup = vi.fn().mockResolvedValue([usable('Drywall repair', 175)])
    vi.mocked(getPriceResearchProviderChain).mockResolvedValue([{ lookup }] as never)

    const sections = [
      section('Work', [item({ description: 'Drywall repair', unit_price: 0, price_source: 'ai_estimate' })]),
    ]

    const t0 = Date.now()
    await researchUnmatchedPrices(sections, ctx())
    const elapsedMs = Date.now() - t0

    // Exactly ONE read attempt (the old code retried up to 3x with 150ms
    // sleeps on a miss — that retry loop is gone).
    expect(readCount).toBe(1)
    expect(elapsedMs).toBeLessThan(300)

    expect(mockRecordCreditDebit).toHaveBeenCalledOnce()
    expect(mockRecordCreditDebit.mock.calls[0][0]).toMatchObject({
      operationType: 'price_research',
      realCostUsd: null,
    })
  })
})
