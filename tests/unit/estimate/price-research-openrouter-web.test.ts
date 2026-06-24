import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 107 Plan 02 — RSRC-01: the OpenRouter-web price-research adapter.
 *
 * Locks (mocked fetch + mocked platform-config — ZERO live network, no real key):
 *   1. lookup() issues ONE fetch to /chat/completions whose body.tools[0] is
 *      { type:'openrouter:web_search', parameters:{ engine, max_results } } with
 *      NO tool_choice and NO create_estimate function tool (SEPARATE call).
 *   2. engine defaults to 'exa'; metadata.research_engine === 'native' selects
 *      'native'; any other value falls back to 'exa'.
 *   3. A response with a matching url_citation annotation + a parseable price yields
 *      source_url + snippet (isUsableCandidate true); a response with NO annotation
 *      yields null source_url/snippet (the evidence gate).
 *   4. Missing OpenRouter key → all-misses, fetch NOT called.
 *   5. A thrown fetch / non-ok status / malformed JSON → all-misses (never throws).
 *
 * Placeholder credentials only — gitleaks-safe.
 */

const { getIntegrationKey, getOpenRouterDefaultModel, createServiceClient } = vi.hoisted(() => ({
  getIntegrationKey: vi.fn(async () => 'sk-test-or-placeholder' as string | null),
  getOpenRouterDefaultModel: vi.fn(async () => 'anthropic/claude-sonnet-4' as string | null),
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey,
  getOpenRouterDefaultModel,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient,
}))

import { makeOpenRouterWebProvider } from '@/lib/estimate/price-research/adapters/openrouter-web'
import { isUsableCandidate } from '@/lib/estimate/price-research/provider'

/**
 * Chainable Supabase mock whose terminal `.maybeSingle()` resolves to a
 * platform_integrations row carrying `metadata` (or null for "no row").
 */
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

/** Build an OpenRouter chat response carrying model JSON + optional annotations. */
function orResponse(content: string, annotations: unknown[] = []) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content,
            annotations,
          },
        },
      ],
      usage: { server_tool_use: { web_search_requests: 1 } },
    }),
    text: async () => '',
  }
}

const region = { city: 'Austin', state: 'TX' }

beforeEach(() => {
  vi.clearAllMocks()
  getIntegrationKey.mockResolvedValue('sk-test-or-placeholder')
  getOpenRouterDefaultModel.mockResolvedValue('anthropic/claude-sonnet-4')
  mockEngineRow(null) // default → exa
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('makeOpenRouterWebProvider — request shape', () => {
  it('issues a SEPARATE openrouter:web_search call (engine exa default, no tool_choice)', async () => {
    const fetchMock = vi.fn(async () =>
      orResponse(JSON.stringify({ results: [] })) as unknown as Response
    )
    vi.stubGlobal('fetch', fetchMock)

    await makeOpenRouterWebProvider().lookup([{ name: 'Drywall repair' }], region, 'USD')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/chat/completions')
    const body = JSON.parse(init.body as string)
    expect(body.tools[0].type).toBe('openrouter:web_search')
    expect(body.tools[0].parameters.engine).toBe('exa')
    expect(typeof body.tools[0].parameters.max_results).toBe('number')
    expect(body.tool_choice).toBeUndefined()
    // SEPARATE call — no forced create_estimate function tool.
    expect(JSON.stringify(body)).not.toContain('create_estimate')
    expect(JSON.stringify(body)).not.toContain('"type":"function"')
  })

  it('selects engine native when metadata.research_engine === "native"', async () => {
    mockEngineRow({ research_engine: 'native' })
    const fetchMock = vi.fn(async () =>
      orResponse(JSON.stringify({ results: [] })) as unknown as Response
    )
    vi.stubGlobal('fetch', fetchMock)

    await makeOpenRouterWebProvider().lookup([{ name: 'Drywall repair' }], region, 'USD')

    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.tools[0].parameters.engine).toBe('native')
  })

  it('falls back to exa for an unrecognized research_engine value', async () => {
    mockEngineRow({ research_engine: 'wat' })
    const fetchMock = vi.fn(async () =>
      orResponse(JSON.stringify({ results: [] })) as unknown as Response
    )
    vi.stubGlobal('fetch', fetchMock)

    await makeOpenRouterWebProvider().lookup([{ name: 'Drywall repair' }], region, 'USD')

    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.tools[0].parameters.engine).toBe('exa')
  })
})

describe('makeOpenRouterWebProvider — evidence gate', () => {
  it('returns source_url + snippet when the model price is backed by a real url_citation', async () => {
    const content = JSON.stringify({
      results: [
        {
          name: 'Drywall repair',
          unit_price: 150,
          currency: 'USD',
          source_url: 'https://example.com/drywall-prices',
          snippet: 'self-asserted snippet (ignored)',
        },
      ],
    })
    const annotations = [
      {
        type: 'url_citation',
        url_citation: {
          url: 'https://example.com/drywall-prices',
          title: 'Drywall pricing',
          content: 'Average drywall repair runs about $150 in Austin, TX.',
        },
      },
    ]
    const fetchMock = vi.fn(async () =>
      orResponse(content, annotations) as unknown as Response
    )
    vi.stubGlobal('fetch', fetchMock)

    const out = await makeOpenRouterWebProvider().lookup(
      [{ name: 'Drywall repair' }],
      region,
      'USD'
    )

    expect(out).toHaveLength(1)
    expect(out[0].source_url).toBe('https://example.com/drywall-prices')
    expect(out[0].snippet).toContain('$150')
    expect(out[0].unit_price).toBe(150)
    expect(isUsableCandidate(out[0])).toBe(true)
  })

  it('extracts the price from a PROSE-WRAPPED reply (preamble + fenced ```json block + trailing note)', async () => {
    // Regression for the live UAT bug: web-search models (claude-sonnet-4) return a
    // "Let me search…" preamble, a fenced ```json block, and a "Note: …" suffix — NOT
    // a bare JSON body. The old whole-content JSON.parse failed → every item a miss.
    const inner = JSON.stringify({
      results: [
        {
          name: 'Couch cleaning 8 seats',
          unit_price: 237,
          currency: 'USD',
          source_url: 'https://kandmsteamcleaning.com/prices',
          snippet: 'self-asserted (replaced by the cited content)',
        },
      ],
    })
    const content =
      "I'll search for the average market price of couch cleaning in Austin, TX.\n" +
      'Let me search for more specific information.\n\n' +
      'Based on my search results, here is the pricing:\n\n' +
      '```json\n' +
      inner +
      '\n```\n\n' +
      'Note: the price is calculated from the sectional pricing structure ($179 + 2×$29).'
    const annotations = [
      {
        type: 'url_citation',
        url_citation: {
          url: 'https://kandmsteamcleaning.com/prices',
          title: 'Furniture & Upholstery Cleaning Price List | K&M Steam Cleaning',
          content: 'Sectional 1st 6 feet Cleaning $179. Each Additional Foot $29.',
        },
      },
    ]
    const fetchMock = vi.fn(async () =>
      orResponse(content, annotations) as unknown as Response
    )
    vi.stubGlobal('fetch', fetchMock)

    const out = await makeOpenRouterWebProvider().lookup(
      [{ name: 'Couch cleaning 8 seats' }],
      region,
      'USD'
    )

    expect(out).toHaveLength(1)
    expect(out[0].unit_price).toBe(237)
    expect(out[0].source_url).toBe('https://kandmsteamcleaning.com/prices')
    expect(out[0].snippet).toContain('$179')
    expect(isUsableCandidate(out[0])).toBe(true)
  })

  it('nulls out source_url/snippet when the model cites a url NOT in the annotations', async () => {
    const content = JSON.stringify({
      results: [
        {
          name: 'Drywall repair',
          unit_price: 150,
          currency: 'USD',
          source_url: 'https://hallucinated.example/not-real',
          snippet: 'totally made up',
        },
      ],
    })
    const fetchMock = vi.fn(async () =>
      orResponse(content, []) as unknown as Response
    )
    vi.stubGlobal('fetch', fetchMock)

    const out = await makeOpenRouterWebProvider().lookup(
      [{ name: 'Drywall repair' }],
      region,
      'USD'
    )

    expect(out).toHaveLength(1)
    expect(out[0].source_url).toBeNull()
    expect(out[0].snippet).toBeNull()
    expect(isUsableCandidate(out[0])).toBe(false)
  })

  it('returns one miss per requested item that the model did not answer', async () => {
    const content = JSON.stringify({ results: [] })
    const fetchMock = vi.fn(async () =>
      orResponse(content, []) as unknown as Response
    )
    vi.stubGlobal('fetch', fetchMock)

    const out = await makeOpenRouterWebProvider().lookup(
      [{ name: 'Drywall repair' }, { name: 'Couch cleaning 8 seats' }],
      region,
      'USD'
    )

    expect(out).toHaveLength(2)
    expect(out.map((r) => r.name)).toEqual(['Drywall repair', 'Couch cleaning 8 seats'])
    expect(out.every((r) => r.source_url === null && r.unit_price === null)).toBe(true)
  })
})

describe('makeOpenRouterWebProvider — degraded paths (never throws)', () => {
  it('missing OpenRouter key → all-misses, fetch NOT called', async () => {
    getIntegrationKey.mockResolvedValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const out = await makeOpenRouterWebProvider().lookup(
      [{ name: 'Drywall repair' }],
      region,
      'USD'
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(out).toHaveLength(1)
    expect(out[0].source_url).toBeNull()
    expect(out[0].unit_price).toBeNull()
    expect(out[0].currency).toBe('USD')
  })

  it('a thrown fetch → all-misses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const out = await makeOpenRouterWebProvider().lookup(
      [{ name: 'Drywall repair' }],
      region,
      'USD'
    )

    expect(out).toHaveLength(1)
    expect(out[0].source_url).toBeNull()
    expect(out[0].unit_price).toBeNull()
  })

  it('a non-ok status → all-misses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'boom',
      json: async () => ({}),
    }) as unknown as Response))

    const out = await makeOpenRouterWebProvider().lookup(
      [{ name: 'Drywall repair' }],
      region,
      'USD'
    )

    expect(out).toHaveLength(1)
    expect(out[0].source_url).toBeNull()
  })

  it('malformed model JSON → all-misses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      orResponse('not json at all {{{', []) as unknown as Response
    ))

    const out = await makeOpenRouterWebProvider().lookup(
      [{ name: 'Drywall repair' }],
      region,
      'USD'
    )

    expect(out).toHaveLength(1)
    expect(out[0].source_url).toBeNull()
  })

  it('empty items → [] (no fetch)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const out = await makeOpenRouterWebProvider().lookup([], region, 'USD')

    expect(out).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
