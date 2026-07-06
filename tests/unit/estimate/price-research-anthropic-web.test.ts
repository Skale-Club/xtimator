import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 107 Plan 02 — RSRC-02 (gated quality-fallback): the Anthropic-web adapter.
 *
 * Locks (mocked @anthropic-ai/sdk + mocked platform-config — ZERO live network):
 *   1. lookup() issues ONE messages.create with tools[0].type === 'web_search_20250305'
 *      and tools[0].user_location { type:'approximate', city:region.city,
 *      region:region.state, country:'US' }.
 *   2. A response with web_search_result blocks + citations (url + cited_text) yields
 *      usable results (source_url + snippet); a web_search_tool_result_error → miss.
 *   3. Missing Anthropic key → all-misses, SDK NOT constructed/called.
 *   4. A thrown create() → all-misses (never throws).
 *
 * Placeholder credentials only — gitleaks-safe.
 */

const { getIntegrationKey, createMock, AnthropicCtor } = vi.hoisted(() => {
  const createMock = vi.fn()
  // Anthropic's default export is a class — the mock must be constructable.
  const AnthropicCtor = vi.fn(function (this: { messages: { create: typeof createMock } }) {
    this.messages = { create: createMock }
  })
  return {
    getIntegrationKey: vi.fn(async () => 'sk-ant-test-placeholder' as string | null),
    createMock,
    AnthropicCtor,
  }
})

vi.mock('@/lib/platform-config', () => ({ getIntegrationKey }))
vi.mock('@anthropic-ai/sdk', () => ({ default: AnthropicCtor }))

import { makeAnthropicWebProvider } from '@/lib/estimate/price-research/adapters/anthropic-web'
import { isUsableCandidate } from '@/lib/estimate/price-research/provider'

const region = { city: 'Austin', state: 'TX' }

/** A canned Anthropic response: a web_search_result block + a text block citing it. */
function citedResponse() {
  return {
    content: [
      {
        type: 'web_search_tool_result',
        content: [
          {
            type: 'web_search_result',
            url: 'https://example.com/drywall-prices',
            title: 'Drywall pricing in Austin',
            page_age: '2026-01-01',
          },
        ],
      },
      {
        type: 'text',
        text: JSON.stringify({
          results: [
            {
              name: 'Drywall repair',
              unit_price: 150,
              currency: 'USD',
              source_url: 'https://example.com/drywall-prices',
              snippet: 'placeholder',
            },
          ],
        }),
        citations: [
          {
            type: 'web_search_result_location',
            url: 'https://example.com/drywall-prices',
            title: 'Drywall pricing in Austin',
            cited_text: 'Average drywall repair runs about $150 in Austin, TX.',
          },
        ],
      },
    ],
  }
}

/** A response whose search tool errored — every item must become a miss. */
function erroredResponse() {
  return {
    content: [
      {
        type: 'web_search_tool_result',
        content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
      },
      {
        type: 'text',
        text: JSON.stringify({
          results: [
            {
              name: 'Drywall repair',
              unit_price: 150,
              currency: 'USD',
              source_url: 'https://example.com/x',
              snippet: 'no citation backing',
            },
          ],
        }),
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getIntegrationKey.mockResolvedValue('sk-ant-test-placeholder')
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('makeAnthropicWebProvider — request shape', () => {
  it('issues a web_search_20250305 call with user_location {city, region:state, country:US}', async () => {
    createMock.mockResolvedValue(citedResponse())

    await makeAnthropicWebProvider().lookup([{ name: 'Drywall repair' }], region, 'USD')

    expect(createMock).toHaveBeenCalledTimes(1)
    const args = createMock.mock.calls[0][0]
    expect(args.tools[0].type).toBe('web_search_20250305')
    expect(args.tools[0].name).toBe('web_search')
    expect(args.tools[0].user_location.type).toBe('approximate')
    expect(args.tools[0].user_location.city).toBe('Austin')
    expect(args.tools[0].user_location.region).toBe('TX')
    expect(args.tools[0].user_location.country).toBe('US')
  })
})

describe('makeAnthropicWebProvider — evidence gate', () => {
  it('citations → usable result (source_url + cited_text snippet)', async () => {
    createMock.mockResolvedValue(citedResponse())

    const out = await makeAnthropicWebProvider().lookup(
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

  it('web_search_tool_result_error → miss (null source_url)', async () => {
    createMock.mockResolvedValue(erroredResponse())

    const out = await makeAnthropicWebProvider().lookup(
      [{ name: 'Drywall repair' }],
      region,
      'USD'
    )

    expect(out).toHaveLength(1)
    expect(out[0].source_url).toBeNull()
    expect(isUsableCandidate(out[0])).toBe(false)
  })

  it('warns loudly when results parse but ZERO citations are indexed — evidence gate untouched (D4)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // Parseable results but NO citations in any block — the silent 97%
      // evidence-gate-rejection mode. Must warn while staying gated.
      createMock.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              results: [
                {
                  name: 'Drywall repair',
                  unit_price: 150,
                  currency: 'USD',
                  source_url: 'https://example.com/drywall-prices',
                  snippet: 'no citation backing',
                },
              ],
            }),
          },
        ],
      })

      const out = await makeAnthropicWebProvider().lookup(
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

  it('returns one miss per unanswered requested item', async () => {
    createMock.mockResolvedValue(citedResponse())

    const out = await makeAnthropicWebProvider().lookup(
      [{ name: 'Drywall repair' }, { name: 'Couch cleaning 8 seats' }],
      region,
      'USD'
    )

    expect(out).toHaveLength(2)
    expect(out.map((r) => r.name)).toEqual(['Drywall repair', 'Couch cleaning 8 seats'])
    expect(out[1].source_url).toBeNull()
    expect(out[1].unit_price).toBeNull()
  })
})

describe('makeAnthropicWebProvider — degraded paths (never throws)', () => {
  it('missing Anthropic key → all-misses, SDK NOT constructed/called', async () => {
    getIntegrationKey.mockResolvedValue(null)

    const out = await makeAnthropicWebProvider().lookup(
      [{ name: 'Drywall repair' }],
      region,
      'USD'
    )

    expect(AnthropicCtor).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
    expect(out).toHaveLength(1)
    expect(out[0].source_url).toBeNull()
    expect(out[0].unit_price).toBeNull()
    expect(out[0].currency).toBe('USD')
  })

  it('a thrown create() → all-misses', async () => {
    createMock.mockRejectedValue(new Error('anthropic down'))

    const out = await makeAnthropicWebProvider().lookup(
      [{ name: 'Drywall repair' }],
      region,
      'USD'
    )

    expect(out).toHaveLength(1)
    expect(out[0].source_url).toBeNull()
    expect(out[0].unit_price).toBeNull()
  })

  it('empty items → [] (no SDK call)', async () => {
    const out = await makeAnthropicWebProvider().lookup([], region, 'USD')
    expect(out).toEqual([])
    expect(AnthropicCtor).not.toHaveBeenCalled()
  })

  it('threads null region into user_location as undefined city/region', async () => {
    createMock.mockResolvedValue(citedResponse())

    await makeAnthropicWebProvider().lookup(
      [{ name: 'Drywall repair' }],
      { city: null, state: null },
      'USD'
    )

    const args = createMock.mock.calls[0][0]
    expect(args.tools[0].user_location.country).toBe('US')
    expect(args.tools[0].user_location.city).toBeUndefined()
    expect(args.tools[0].user_location.region).toBeUndefined()
  })
})
