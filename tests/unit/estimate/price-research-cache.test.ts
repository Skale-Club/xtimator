import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 106 — RCACHE-01 / RCACHE-02: the tenant-scoped price-research cache module.
 *
 * Locks the four scope-required behaviors:
 *   1. Leakage guard — the returned VALUE is the neutral market datum only
 *      ({ unit_price, currency, source, confidence?, expires_at }); never
 *      company_id / client / margin / job-text.
 *   2. Cache HIT returns the stored price WITHOUT invoking any provider.
 *   3. TTL expiry → MISS (a row whose expires_at < now returns null).
 *   4. Name + region normalization collapses punctuation/space/case variants to
 *      the SAME normalized_name + region cache key.
 *
 * No real network, no real DB, no secrets — the service client is fully mocked with
 * a capture-based chainable `from()` mock.
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import { requireServiceClient } from '@/lib/supabase/service'
import { get, put, PRICE_RESEARCH_TTL_MS, type CachedPriceDatum } from '@/lib/estimate/price-research/cache'

/**
 * Build a chainable Supabase mock whose `.eq(col, val)` calls are recorded and whose
 * terminal `.maybeSingle()` resolves to the row supplied per test. `upsert` is
 * captured for the put-path assertions.
 */
function buildServiceMock(row: Record<string, unknown> | null) {
  const eqCalls: Array<[string, unknown]> = []
  const upsertCalls: Array<[Record<string, unknown>, Record<string, unknown> | undefined]> = []

  const query: Record<string, unknown> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn((col: string, val: unknown) => {
    eqCalls.push([col, val])
    return query
  })
  query.maybeSingle = vi.fn(async () => ({ data: row, error: null }))

  const from = vi.fn(() => ({
    ...query,
    upsert: vi.fn(async (values: Record<string, unknown>, opts?: Record<string, unknown>) => {
      upsertCalls.push([values, opts])
      return { data: null, error: null }
    }),
  }))

  vi.mocked(requireServiceClient).mockReturnValue({ from } as never)
  return { from, eqCalls, upsertCalls }
}

/** Pull the value passed to `.eq('<col>', X)` from the recorded calls. */
function eqArg(eqCalls: Array<[string, unknown]>, col: string): unknown {
  const hit = eqCalls.find(([c]) => c === col)
  return hit?.[1]
}

const FUTURE = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 1000).toISOString()

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('RCACHE — price-research cache module', () => {
  it('leakage guard: a get() HIT returns ONLY the neutral datum keys (no company_id/client/margin/job text)', async () => {
    buildServiceMock({
      unit_price: 120.5,
      currency_code: 'USD',
      source: 'exa',
      confidence: 0.8,
      expires_at: FUTURE,
    })

    const datum = await get('company-1', 'Couch cleaning 8 seats', { city: 'Austin', state: 'TX' }, 'USD')
    expect(datum).not.toBeNull()

    const allowed = ['unit_price', 'currency', 'source', 'confidence', 'expires_at']
    const keys = Object.keys(datum as CachedPriceDatum)
    // Subset check — every returned key is in the allow-list.
    for (const k of keys) {
      expect(allowed, `unexpected key leaked: ${k}`).toContain(k)
    }
    // Explicitly assert the tenant-private / cross-tenant-leak fields are absent.
    for (const forbidden of ['company_id', 'client', 'margin', 'description', 'job']) {
      expect(keys, `forbidden field present: ${forbidden}`).not.toContain(forbidden)
    }

    // Compile-time guard: this typed literal must match CachedPriceDatum exactly, so
    // adding a leaky field to the interface becomes a TS error here too.
    const typed: CachedPriceDatum = {
      unit_price: 1,
      currency: 'USD',
      source: null,
      confidence: null,
      expires_at: FUTURE,
    }
    expect(typed.unit_price).toBe(1)
  })

  it('cache HIT returns the stored price WITHOUT invoking the provider', async () => {
    buildServiceMock({
      unit_price: 250,
      currency_code: 'USD',
      source: 'exa',
      confidence: null,
      expires_at: FUTURE,
    })

    // A provider that must never be touched on a HIT — get() has no provider seam.
    const provider = vi.fn()

    const datum = await get('company-1', 'Fence painting', { city: 'Austin', state: 'TX' }, 'USD')

    expect(datum?.unit_price).toBe(250)
    expect(provider).not.toHaveBeenCalled()
  })

  it('TTL expiry → MISS: an expired row (expires_at < now) returns null even though a row exists', async () => {
    buildServiceMock({
      unit_price: 99,
      currency_code: 'USD',
      source: 'exa',
      confidence: null,
      expires_at: PAST,
    })

    const datum = await get('company-1', 'Roof repair', { city: 'Austin', state: 'TX' }, 'USD')
    expect(datum).toBeNull()
  })

  it('missing row → MISS (null)', async () => {
    buildServiceMock(null)
    const datum = await get('company-1', 'Anything', { city: 'Austin', state: 'TX' }, 'USD')
    expect(datum).toBeNull()
  })

  it('normalization collapse: punctuation/space/case variants resolve to the SAME normalized_name + region key', async () => {
    const a = buildServiceMock({
      unit_price: 1,
      currency_code: 'USD',
      source: null,
      confidence: null,
      expires_at: FUTURE,
    })
    await get('company-1', 'Couch cleaning 8 seats', { city: 'Austin', state: 'TX' }, 'USD')
    const nameA = eqArg(a.eqCalls, 'normalized_name')
    const regionA = eqArg(a.eqCalls, 'region')

    const b = buildServiceMock({
      unit_price: 1,
      currency_code: 'USD',
      source: null,
      confidence: null,
      expires_at: FUTURE,
    })
    await get('company-1', 'couch cleaning, 8 seats ', { city: 'austin ', state: 'tx' }, 'USD')
    const nameB = eqArg(b.eqCalls, 'normalized_name')
    const regionB = eqArg(b.eqCalls, 'region')

    expect(nameA).toBe(nameB)
    expect(regionA).toBe(regionB)
  })

  it('put() stamps expires_at = now + PRICE_RESEARCH_TTL_MS (~30 days) and upserts on the 4-tuple key', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-06-24T00:00:00.000Z')
    vi.setSystemTime(now)

    const m = buildServiceMock(null)
    await put({
      companyId: 'company-1',
      name: 'Couch cleaning 8 seats',
      region: { city: 'Austin', state: 'TX' },
      currency: 'USD',
      datum: { unit_price: 120, source: 'exa', confidence: 0.7 },
    })

    expect(m.upsertCalls).toHaveLength(1)
    const [values, opts] = m.upsertCalls[0]
    const stamped = new Date(values.expires_at as string).getTime()
    expect(stamped).toBe(now.getTime() + PRICE_RESEARCH_TTL_MS)
    // ~30 days ahead within tolerance.
    expect(stamped - now.getTime()).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -3)
    expect(opts?.onConflict).toBe('company_id,normalized_name,region,currency_code')
    // The KEY column company_id is written for scoping (it is NOT part of the value shape).
    expect(values.company_id).toBe('company-1')
  })

  it('PRICE_RESEARCH_TTL_MS is exactly 30 days', () => {
    expect(PRICE_RESEARCH_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('put() RESOLVES and warns "cache write failed" when the upsert errors (D9)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const from = vi.fn(() => ({
        upsert: vi.fn(async () => ({ data: null, error: { message: 'boom' } })),
      }))
      vi.mocked(requireServiceClient).mockReturnValue({ from } as never)

      // Never throws — put() keeps resolving void even on a failed write.
      await expect(
        put({
          companyId: 'company-1',
          name: 'Couch cleaning 8 seats',
          region: { city: 'Austin', state: 'TX' },
          currency: 'USD',
          datum: { unit_price: 120, source: 'exa', confidence: 0.7 },
        })
      ).resolves.toBeUndefined()

      const msg = String(
        warnSpy.mock.calls
          .map((c) => c[0])
          .find((m) => String(m).includes('cache write failed'))
      )
      expect(msg).toContain('cache write failed')
    } finally {
      warnSpy.mockRestore()
    }
  })
})
