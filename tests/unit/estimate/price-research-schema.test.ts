import { describe, it, expect } from 'vitest'
import {
  priceResearchResultSchema,
  priceResearchPayloadSchema,
} from '@/lib/estimate/price-research/schema'

/**
 * Phase 107 — RSRC-02: the zod schema that validates a model research payload
 * BEFORE it is trusted (mirrors estimateOutputSchema / normalizeOutput discipline —
 * never trust a raw model number). safeParse never throws on garbage.
 */
describe('priceResearchResultSchema — validate before trust', () => {
  it('parses a well-formed result (all fields present)', () => {
    const r = priceResearchResultSchema.safeParse({
      name: 'Couch cleaning 8 seats',
      unit_price: 120.5,
      currency: 'USD',
      source_url: 'https://example.com/pricing',
      snippet: 'Average sofa cleaning runs $100-150.',
      confidence: 0.8,
    })
    expect(r.success).toBe(true)
  })

  it('allows null unit_price / source_url / snippet at the SCHEMA level (a miss is still a valid shape)', () => {
    const r = priceResearchResultSchema.safeParse({
      name: 'Mystery service',
      unit_price: null,
      currency: 'USD',
      source_url: null,
      snippet: null,
    })
    // The evidence GATE (isUsableCandidate) — not the schema — rejects citation-less
    // entries. The schema only guarantees the shape is parseable.
    expect(r.success).toBe(true)
  })

  it('confidence is optional', () => {
    const r = priceResearchResultSchema.safeParse({
      name: 'Fence painting',
      unit_price: 9,
      currency: 'USD',
      source_url: 'https://x.test',
      snippet: 'snip',
    })
    expect(r.success).toBe(true)
  })

  it('returns {success:false} on garbage — never throws', () => {
    expect(() =>
      priceResearchResultSchema.safeParse({ name: 123, unit_price: 'free', currency: 5 })
    ).not.toThrow()
    const r = priceResearchResultSchema.safeParse({ totally: 'wrong' })
    expect(r.success).toBe(false)
  })

  it('rejects an empty name and an empty currency', () => {
    expect(
      priceResearchResultSchema.safeParse({
        name: '',
        unit_price: 1,
        currency: 'USD',
        source_url: null,
        snippet: null,
      }).success
    ).toBe(false)
    expect(
      priceResearchResultSchema.safeParse({
        name: 'ok',
        unit_price: 1,
        currency: '',
        source_url: null,
        snippet: null,
      }).success
    ).toBe(false)
  })

  it('rejects a non-finite unit_price (NaN/Infinity)', () => {
    const r = priceResearchResultSchema.safeParse({
      name: 'ok',
      unit_price: Number.POSITIVE_INFINITY,
      currency: 'USD',
      source_url: null,
      snippet: null,
    })
    expect(r.success).toBe(false)
  })
})

describe('priceResearchPayloadSchema — { results: [...] }', () => {
  it('parses a payload wrapping an array of results', () => {
    const r = priceResearchPayloadSchema.safeParse({
      results: [
        {
          name: 'Roof repair',
          unit_price: 500,
          currency: 'USD',
          source_url: 'https://x.test',
          snippet: 'snip',
        },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('parses an empty results array', () => {
    expect(priceResearchPayloadSchema.safeParse({ results: [] }).success).toBe(true)
  })

  it('returns {success:false} when results is not an array', () => {
    expect(priceResearchPayloadSchema.safeParse({ results: 'nope' }).success).toBe(false)
  })
})
