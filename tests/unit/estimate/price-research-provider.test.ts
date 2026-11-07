import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 107 — RSRC-02 / RSRC-04 / RFALL-04: the PriceResearchProvider port.
 *
 * Locks:
 *   1. getPriceResearchProvider() resolves null when the platform_integrations
 *      research-source metadata is unset/unknown (the Phase-108 safe no-op).
 *   2. The evidence-gated isUsableCandidate truth table — a citation-less guess is
 *      NEVER usable (source_url + snippet + positive price all required).
 *   3. The factory DISPATCHES to a (mocked) adapter when a source IS configured.
 *
 * No real network, no real DB, no secrets — the service client + the Plan-02
 * adapters are mocked. Capture-based chainable `from()` mock mirrors the
 * price-research-cache test.
 */

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))

// The Plan-02 adapter modules are dynamically imported by the factory. Mock them
// here so Plan 01's factory dispatch is testable before the adapters land.
const openRouterLookup = vi.fn(async () => [])
vi.mock('@/lib/estimate/price-research/adapters/openrouter-web', () => ({
  makeOpenRouterWebProvider: vi.fn(() => ({ lookup: openRouterLookup })),
}))
// An Anthropic key IS configured: the chain must still stay OpenRouter-only.
const getIntegrationKeyMock = vi.fn(async () => 'sk-ant-placeholder' as string | null)
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: (...args: unknown[]) => (getIntegrationKeyMock as (...a: unknown[]) => unknown)(...args),
}))

import { createServiceClient } from '@/lib/supabase/service'
import {
  getPriceResearchProvider,
  getPriceResearchProviderChain,
  isUsableCandidate,
  type PriceResearchResult,
} from '@/lib/estimate/price-research/provider'

/** Chainable Supabase mock whose terminal `.maybeSingle()` resolves to `row`. */
function mockSourceRow(row: Record<string, unknown> | null) {
  const query: Record<string, unknown> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.maybeSingle = vi.fn(async () => ({ data: row, error: null }))
  const from = vi.fn(() => query)
  vi.mocked(createServiceClient).mockReturnValue({ from } as never)
  return { from }
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.clearAllMocks()
})

const base: PriceResearchResult = {
  name: 'Couch cleaning 8 seats',
  unit_price: 120,
  currency: 'USD',
  source_url: 'https://example.com/pricing',
  snippet: 'Average sofa cleaning runs $100-150.',
}

describe('isUsableCandidate — the evidence gate', () => {
  it('TRUE only when source_url + snippet are real strings AND unit_price is a positive number', () => {
    expect(isUsableCandidate(base)).toBe(true)
  })

  it('FALSE when source_url is null (citation-less guess)', () => {
    expect(isUsableCandidate({ ...base, source_url: null })).toBe(false)
  })

  it('FALSE when source_url is an empty/whitespace string', () => {
    expect(isUsableCandidate({ ...base, source_url: '' })).toBe(false)
    expect(isUsableCandidate({ ...base, source_url: '   ' })).toBe(false)
  })

  it('FALSE when snippet is null', () => {
    expect(isUsableCandidate({ ...base, snippet: null })).toBe(false)
  })

  it('FALSE when snippet is an empty/whitespace string', () => {
    expect(isUsableCandidate({ ...base, snippet: '' })).toBe(false)
    expect(isUsableCandidate({ ...base, snippet: '  ' })).toBe(false)
  })

  it('FALSE when unit_price is null', () => {
    expect(isUsableCandidate({ ...base, unit_price: null })).toBe(false)
  })

  it('FALSE when unit_price is zero or negative', () => {
    expect(isUsableCandidate({ ...base, unit_price: 0 })).toBe(false)
    expect(isUsableCandidate({ ...base, unit_price: -5 })).toBe(false)
  })
})

describe('getPriceResearchProvider — source resolution from platform_integrations', () => {
  it('returns null when the createServiceClient is unavailable (build-time / unconfigured)', async () => {
    vi.mocked(createServiceClient).mockReturnValue(null as never)
    expect(await getPriceResearchProvider()).toBeNull()
  })

  it('returns null when no research_source row/metadata is configured (Phase-108 safe no-op)', async () => {
    mockSourceRow(null)
    expect(await getPriceResearchProvider()).toBeNull()
  })

  it('returns null when metadata.research_source is an unknown value', async () => {
    mockSourceRow({ metadata: { research_source: 'brave_search' } })
    expect(await getPriceResearchProvider()).toBeNull()
  })

  it('dispatches to the OpenRouter-web adapter when research_source === "openrouter_web"', async () => {
    mockSourceRow({ metadata: { research_source: 'openrouter_web' } })
    const provider = await getPriceResearchProvider()
    expect(provider).not.toBeNull()
    expect(typeof provider!.lookup).toBe('function')
    await provider!.lookup([{ name: 'x' }], { city: 'Austin', state: 'TX' }, 'USD')
    expect(openRouterLookup).toHaveBeenCalledTimes(1)
  })

  it('a stored legacy "anthropic_web" source resolves to the OpenRouter web source', async () => {
    mockSourceRow({ metadata: { research_source: 'anthropic_web' } })
    const provider = await getPriceResearchProvider()
    expect(provider).not.toBeNull()
    await provider!.lookup([{ name: 'x' }], { city: 'Austin', state: 'TX' }, 'USD')
    expect(openRouterLookup).toHaveBeenCalledTimes(1)
  })

  it('the chain contains ONLY the OpenRouter-backed provider even when an Anthropic key is configured', async () => {
    for (const research_source of ['openrouter_web', 'anthropic_web']) {
      vi.clearAllMocks()
      mockSourceRow({ metadata: { research_source } })
      const chain = await getPriceResearchProviderChain()
      expect(chain).toHaveLength(1)
      await chain[0].lookup([{ name: 'x' }], { city: 'Austin', state: 'TX' }, 'USD')
      expect(openRouterLookup).toHaveBeenCalledTimes(1)
      // The Anthropic key is never consulted: no direct-Anthropic quality fallback.
      expect(getIntegrationKeyMock).not.toHaveBeenCalledWith('anthropic')
    }
  })

  it('the chain is empty when no source is configured (safe no-op)', async () => {
    mockSourceRow(null)
    expect(await getPriceResearchProviderChain()).toEqual([])
  })
})
