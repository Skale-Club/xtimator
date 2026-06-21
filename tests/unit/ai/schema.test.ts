import { describe, it, expect, beforeAll } from 'vitest'
import type { z } from 'zod'

/**
 * GUARD-01 — zod schema validation (Wave 0 RED).
 *
 * `estimateOutputSchema` (NEW `@/lib/ai/schema`, lands in Plan 100-01) is the
 * authoritative second gate over the AI tool-call JSON. It mirrors `EstimateOutput`
 * (`lib/ai/types.ts`): sections[].items[] with description/quantity/unit_price/
 * price_source, plus the top-level summary/suggested_project_name and the optional
 * suggested_client_name transform. `EstimateOutput = z.infer<typeof estimateOutputSchema>`.
 *
 * RED today: `@/lib/ai/schema` does not exist yet. The computed-specifier
 * importTarget defeats Vite transform-time import-analysis so the file COLLECTS
 * cleanly and each test fails at RUN time (real RED), not a transform error.
 * Mirrors never-throw.test.ts. The contract here is what Plan 100-01 builds to.
 */

const importTarget = (spec: string) => import(/* @vite-ignore */ spec)

// Resolved in beforeAll so collection never fails on the missing module.
let estimateOutputSchema: z.ZodTypeAny

beforeAll(async () => {
  const mod = await importTarget('@/lib/ai/schema')
  estimateOutputSchema = mod.estimateOutputSchema
})

// A fully-valid raw object (the shape OpenRouter's create_estimate tool returns).
function validRaw(): Record<string, unknown> {
  return {
    suggested_project_name: 'Kitchen Remodel',
    summary: 'Full kitchen demo and rebuild.',
    sections: [
      {
        title: 'Labor',
        items: [
          {
            description: 'Demo existing cabinets',
            quantity: 1,
            unit: 'job',
            unit_price: 500,
            price_source: 'price_book',
          },
        ],
      },
    ],
  }
}

function items(raw: Record<string, unknown>): Array<Record<string, unknown>> {
  return (raw.sections as Array<{ items: Array<Record<string, unknown>> }>)[0].items
}

describe('GUARD-01: estimateOutputSchema accepts valid output', () => {
  it('a fully-valid raw object parses successfully', () => {
    const result = estimateOutputSchema.safeParse(validRaw())
    expect(result.success).toBe(true)
  })

  it('optional top-level fields (notes/timeline/payment_terms/warranty_terms) are accepted', () => {
    const raw = validRaw()
    raw.notes = 'Some notes'
    raw.timeline = '2 weeks'
    raw.payment_terms = '50% upfront'
    raw.warranty_terms = '1 year'
    expect(estimateOutputSchema.safeParse(raw).success).toBe(true)
  })
})

describe('GUARD-01: estimateOutputSchema rejects malformed output', () => {
  it('rejects an item missing description', () => {
    const raw = validRaw()
    delete items(raw)[0].description
    expect(estimateOutputSchema.safeParse(raw).success).toBe(false)
  })

  it('rejects a negative quantity', () => {
    const raw = validRaw()
    items(raw)[0].quantity = -1
    expect(estimateOutputSchema.safeParse(raw).success).toBe(false)
  })

  it('rejects a negative unit_price', () => {
    const raw = validRaw()
    items(raw)[0].unit_price = -5
    expect(estimateOutputSchema.safeParse(raw).success).toBe(false)
  })

  it('rejects a non-finite (NaN) quantity', () => {
    const raw = validRaw()
    items(raw)[0].quantity = NaN
    expect(estimateOutputSchema.safeParse(raw).success).toBe(false)
  })

  it('rejects when the required top-level summary is missing', () => {
    const raw = validRaw()
    delete raw.summary
    expect(estimateOutputSchema.safeParse(raw).success).toBe(false)
  })
})

describe('GUARD-01: price_source defensive coercion (D-15 as preprocess)', () => {
  it('coerces a garbage price_source to ai_estimate without rejecting the parse', () => {
    const raw = validRaw()
    items(raw)[0].price_source = 'garbage'
    const result = estimateOutputSchema.safeParse(raw)
    expect(result.success).toBe(true)
    expect(result.success && result.data.sections[0].items[0].price_source).toBe('ai_estimate')
  })

  it('a missing price_source defaults to ai_estimate', () => {
    const raw = validRaw()
    delete items(raw)[0].price_source
    const result = estimateOutputSchema.safeParse(raw)
    expect(result.success).toBe(true)
    expect(result.success && result.data.sections[0].items[0].price_source).toBe('ai_estimate')
  })

  it('an exact price_book passes through unchanged', () => {
    const result = estimateOutputSchema.safeParse(validRaw())
    expect(result.success && result.data.sections[0].items[0].price_source).toBe('price_book')
  })
})

describe('GUARD-01: suggested_client_name trim/null transform', () => {
  it('trims surrounding whitespace from a non-empty client name', () => {
    const raw = validRaw()
    raw.suggested_client_name = '  Acme  '
    const result = estimateOutputSchema.safeParse(raw)
    expect(result.success && result.data.suggested_client_name).toBe('Acme')
  })

  it('a whitespace-only client name becomes null', () => {
    const raw = validRaw()
    raw.suggested_client_name = '   '
    const result = estimateOutputSchema.safeParse(raw)
    expect(result.success && result.data.suggested_client_name).toBe(null)
  })

  it('an omitted client name becomes null', () => {
    const result = estimateOutputSchema.safeParse(validRaw())
    expect(result.success && result.data.suggested_client_name).toBe(null)
  })
})
