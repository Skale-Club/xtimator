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
  getOpenRouterDefaultModel: vi.fn(async () => 'anthropic/claude-sonnet-5.5' as string | null),
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
  getOpenRouterDefaultModel.mockResolvedValue('anthropic/claude-sonnet-5.5')
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

  it('indexes a FLAT-shape url_citation annotation (no nested url_citation object) — D4', async () => {
    // Live-observed shape drift: some models return the citation fields FLAT on
    // the annotation instead of nested under url_citation. The indexer must
    // tolerate both — a real citation should never be dropped over its shape.
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
        url: 'https://example.com/drywall-prices',
        content: 'Average drywall repair runs about $150 in Austin, TX.',
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
    expect(isUsableCandidate(out[0])).toBe(true)
  })

  it('warns loudly when results parse but ZERO citations are indexed — evidence gate untouched (D4)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const content = JSON.stringify({
        results: [
          {
            name: 'Drywall repair',
            unit_price: 150,
            currency: 'USD',
            source_url: 'https://example.com/drywall-prices',
            snippet: 'self-asserted',
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

      const msg = String(
        warnSpy.mock.calls
          .map((c) => c[0])
          .find((m) => String(m).includes('[price-research]'))
      )
      expect(msg).toContain('[price-research]')
      expect(msg).toContain('0 citations indexed')

      // The evidence gate itself is UNTOUCHED — the result stays gated.
      expect(out).toHaveLength(1)
      expect(out[0].source_url).toBeNull()
      expect(out[0].snippet).toBeNull()
      expect(isUsableCandidate(out[0])).toBe(false)
    } finally {
      warnSpy.mockRestore()
    }
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

// ---------------------------------------------------------------------------
// Tolerant name re-association, tolerant citation match, diagnostics
// ---------------------------------------------------------------------------

type Usage = {
  searches?: number | null
  diagnostics?: import('@/lib/estimate/price-research/provider').LookupDiagnostics
}

function resultJson(rows: Array<Record<string, unknown>>) {
  return JSON.stringify({ results: rows })
}

function citation(url: string, content = 'Cited page says $150.') {
  return { type: 'url_citation', url_citation: { url, title: 't', content } }
}

async function lookupWith(items: { name: string }[], content: string, annotations: unknown[] = []) {
  vi.stubGlobal('fetch', vi.fn(async () => orResponse(content, annotations) as unknown as Response))
  const usages: Usage[] = []
  const out = await makeOpenRouterWebProvider().lookup(items, region, 'USD', {
    onUsage: (u) => usages.push(u),
  })
  return { out, diag: usages.find((u) => u.diagnostics)?.diagnostics }
}

describe('makeOpenRouterWebProvider — loose name re-association', () => {
  const row = (name: string) => ({
    name,
    unit_price: 150,
    currency: 'USD',
    source_url: 'https://example.com/p',
    snippet: 's',
  })

  it('accepts a loose name match and returns it under the REQUESTED name', async () => {
    const { out, diag } = await lookupWith(
      [{ name: 'Drywall repair' }],
      resultJson([row('drywall  Repair!')]),
      [citation('https://example.com/p')]
    )
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Drywall repair')
    expect(out[0].unit_price).toBe(150)
    expect(diag).toMatchObject({ requested: 1, returned: 1, matched: 1, matchedLoosely: 1, cited: 1 })
  })

  it('does not accept an ambiguous loose match (two results share the loose key)', async () => {
    const { out, diag } = await lookupWith(
      [{ name: 'Drywall repair' }],
      resultJson([row('drywall repair.'), row('Drywall-repair')]),
      [citation('https://example.com/p')]
    )
    expect(out[0].unit_price).toBeNull()
    expect(diag).toMatchObject({ returned: 2, matched: 0, matchedLoosely: 0 })
  })

  it('does not accept a loose match when two requested items share the loose key', async () => {
    const { out } = await lookupWith(
      [{ name: 'Drywall repair' }, { name: 'drywall-repair' }],
      resultJson([row('DRYWALL REPAIR!!')]),
      [citation('https://example.com/p')]
    )
    expect(out.every((r) => r.unit_price === null)).toBe(true)
  })

  it('prefers the exact name and leaves an exactly-matched result out of loose matching', async () => {
    const { out, diag } = await lookupWith(
      [{ name: 'Drywall repair' }],
      resultJson([row('Drywall repair'), row('drywall repair.')]),
      [citation('https://example.com/p')]
    )
    expect(out[0].unit_price).toBe(150)
    expect(diag).toMatchObject({ matched: 1, matchedLoosely: 0 })
  })
})

describe('makeOpenRouterWebProvider — tolerant citation match', () => {
  const lookupUrl = async (claimed: string, cited: string) => {
    const { out, diag } = await lookupWith(
      [{ name: 'Drywall repair' }],
      resultJson([
        { name: 'Drywall repair', unit_price: 150, currency: 'USD', source_url: claimed, snippet: 'self' },
      ]),
      [citation(cited, 'Real cited content $150')]
    )
    return { r: out[0], diag }
  }

  it('still accepts an exact-URL citation (not counted as loose)', async () => {
    const { r, diag } = await lookupUrl('https://example.com/a/b', 'https://example.com/a/b')
    expect(r.source_url).toBe('https://example.com/a/b')
    expect(r.snippet).toBe('Real cited content $150')
    expect(diag).toMatchObject({ cited: 1, citedLoosely: 0 })
  })

  it.each([
    ['http protocol', 'http://example.com/a/b', 'https://example.com/a/b'],
    ['www prefix', 'https://www.example.com/a/b', 'https://example.com/a/b'],
    ['cited www prefix', 'https://example.com/a/b', 'https://www.example.com/a/b'],
    ['query string', 'https://example.com/a/b?utm_source=x', 'https://example.com/a/b'],
    ['fragment', 'https://example.com/a/b#price', 'https://example.com/a/b'],
    ['trailing slash', 'https://example.com/a/b/', 'https://example.com/a/b'],
    ['host case', 'https://EXAMPLE.com/a/b', 'https://example.com/a/b'],
  ])('accepts the same host+path with a different %s', async (_label, claimed, cited) => {
    const { r, diag } = await lookupUrl(claimed, cited)
    expect(r.source_url).toBe(claimed)
    // The snippet comes from the MATCHED citation, not the model's self-asserted one.
    expect(r.snippet).toBe('Real cited content $150')
    expect(isUsableCandidate(r)).toBe(true)
    expect(diag).toMatchObject({ cited: 1, citedLoosely: 1 })
  })

  it.each([
    ['different host', 'https://other.com/a/b', 'https://example.com/a/b'],
    ['different subdomain', 'https://blog.example.com/a/b', 'https://example.com/a/b'],
    ['different path', 'https://example.com/a/c', 'https://example.com/a/b'],
    ['deeper path', 'https://example.com/a/b/c', 'https://example.com/a/b'],
    ['unparseable claimed url', 'not a url', 'https://example.com/a/b'],
  ])('rejects a %s', async (_label, claimed, cited) => {
    const { r, diag } = await lookupUrl(claimed, cited)
    expect(r.source_url).toBeNull()
    expect(r.snippet).toBeNull()
    expect(isUsableCandidate(r)).toBe(false)
    expect(diag).toMatchObject({ matched: 1, cited: 0, citedLoosely: 0 })
  })

  it('nulls source and snippet when there is no citation at all (unchanged guarantee)', async () => {
    const { out, diag } = await lookupWith(
      [{ name: 'Drywall repair' }],
      resultJson([
        { name: 'Drywall repair', unit_price: 150, currency: 'USD', source_url: 'https://example.com/a', snippet: 'self' },
      ]),
      []
    )
    expect(out[0].source_url).toBeNull()
    expect(out[0].snippet).toBeNull()
    expect(diag).toMatchObject({ citations: 0, cited: 0 })
  })
})

describe('makeOpenRouterWebProvider — diagnostics', () => {
  const collect = async (response: () => unknown) => {
    vi.stubGlobal('fetch', vi.fn(async () => response() as Response))
    const usages: Usage[] = []
    const out = await makeOpenRouterWebProvider().lookup([{ name: 'Drywall repair' }], region, 'USD', {
      onUsage: (u) => usages.push(u),
    })
    return { out, diags: usages.filter((u) => u.diagnostics).map((u) => u.diagnostics!) }
  }

  it('reports once on an HTTP failure', async () => {
    const { out, diags } = await collect(() => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => '',
    }))
    expect(out[0].unit_price).toBeNull()
    expect(diags).toEqual([
      {
        requested: 1,
        httpOk: false,
        parsed: false,
        returned: 0,
        matched: 0,
        matchedLoosely: 0,
        citations: 0,
        cited: 0,
        citedLoosely: 0,
      },
    ])
  })

  it('reports once on an unparseable reply, with the citations it saw', async () => {
    const { diags } = await collect(() => orResponse('not json {{{', [citation('https://example.com/p')]))
    expect(diags).toHaveLength(1)
    expect(diags[0]).toMatchObject({ httpOk: true, parsed: false, returned: 0, citations: 1 })
  })

  it('reports once on a schema failure', async () => {
    const { diags } = await collect(() => orResponse(JSON.stringify({ results: 'nope' }), []))
    expect(diags).toHaveLength(1)
    expect(diags[0]).toMatchObject({ httpOk: true, parsed: false })
  })

  it('reports once on success and keeps the searches report', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          orResponse(
            resultJson([
              { name: 'Drywall repair', unit_price: 150, currency: 'USD', source_url: 'https://example.com/p', snippet: 's' },
            ]),
            [citation('https://example.com/p')]
          ) as unknown as Response
      )
    )
    const usages: Usage[] = []
    await makeOpenRouterWebProvider().lookup([{ name: 'Drywall repair' }], region, 'USD', {
      onUsage: (u) => usages.push(u),
    })
    expect(usages.some((u) => u.searches === 1)).toBe(true)
    const diags = usages.filter((u) => u.diagnostics).map((u) => u.diagnostics)
    expect(diags).toEqual([
      {
        requested: 1,
        httpOk: true,
        parsed: true,
        returned: 1,
        matched: 1,
        matchedLoosely: 0,
        citations: 1,
        cited: 1,
        citedLoosely: 0,
      },
    ])
  })

  it('never throws when onUsage throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => orResponse('x', []) as unknown as Response))
    const out = await makeOpenRouterWebProvider().lookup([{ name: 'Drywall repair' }], region, 'USD', {
      onUsage: () => {
        throw new Error('boom')
      },
    })
    expect(out).toHaveLength(1)
  })
})
