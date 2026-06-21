import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GUARD-01 — bounded schema-retry at the provider boundary (Wave 0 RED).
 *
 * Contract proven here (source lands in Plan 100-01):
 *   - VALID FIRST TIME → exactly ONE underlying generate call (ZERO retry). This is
 *     the CONTEXT invariant "Happy path AI call count unchanged".
 *   - FIRST INVALID, SECOND VALID → exactly TWO calls (retry fires once) and the
 *     valid value is returned.
 *   - BOTH INVALID → the boundary rejects with `InvalidEstimateOutputError`
 *     (`invalidOutput: true`), which 99/100 wiring maps to `{ failure: { reason: 'invalid_output' } }`.
 *
 * The retry seam is `getAIProviderWithFallback` (`@/lib/ai/provider-with-fallback`).
 * We mock `@/lib/ai` (primary `getAIProvider`) and the Gemini fallback adapter so
 * the fallback never fires for the valid-first-time assertion, then assert call
 * counts on the mocked primary's `generateEstimate`.
 *
 * `InvalidEstimateOutputError` is imported from `@/lib/ai/with-fallback` (Plan
 * 100-01 confirms the export module). It does NOT exist yet → RED.
 *
 * Computed-specifier importTarget defeats Vite transform-time import-analysis so
 * the file COLLECTS cleanly and fails at RUN time (real RED). Mirrors never-throw.test.ts.
 */

const importTarget = (spec: string) => import(/* @vite-ignore */ spec)

const primaryGenerate = vi.fn()
const fallbackGenerate = vi.fn()

vi.mock('@/lib/ai', () => ({
  getAIProvider: vi.fn(async () => ({
    generateEstimate: primaryGenerate,
    refineEstimate: vi.fn(),
  })),
}))

vi.mock('@/lib/ai/providers/gemini', () => ({
  GeminiAdapter: class {
    generateEstimate = fallbackGenerate
    refineEstimate = vi.fn()
  },
}))

const VALID_OUTPUT = {
  suggested_project_name: 'P',
  suggested_client_name: null,
  summary: 'S',
  sections: [
    {
      title: 'Labor',
      items: [
        { description: 'Demo', quantity: 1, unit_price: 500, price_source: 'ai_estimate' as const },
      ],
    },
  ],
}

const INPUT = {
  industry: null,
  projectName: 'P',
  projectType: null,
  targetBudget: null,
  clientName: null,
  clientAddress: null,
  transcripts: [],
  photoDescriptions: [],
  priceBookItems: [],
  defaultPaymentTerms: null,
  defaultWarrantyTerms: null,
}

beforeEach(() => {
  primaryGenerate.mockReset()
  fallbackGenerate.mockReset()
})

describe('GUARD-01: bounded schema-retry at the provider boundary', () => {
  it('valid first time = exactly one call (no retry)', async () => {
    primaryGenerate.mockResolvedValueOnce(VALID_OUTPUT)

    const { getAIProviderWithFallback } = await importTarget('@/lib/ai/provider-with-fallback')
    const provider = await getAIProviderWithFallback('company-1')
    const result = await provider.generateEstimate(INPUT)

    expect(result).toEqual(VALID_OUTPUT)
    expect(primaryGenerate).toHaveBeenCalledTimes(1)
    expect(fallbackGenerate).not.toHaveBeenCalled()
  })

  it('retry once then succeed = exactly two calls', async () => {
    const { InvalidEstimateOutputError } = await importTarget('@/lib/ai/with-fallback')
    primaryGenerate
      .mockRejectedValueOnce(new InvalidEstimateOutputError({ issues: [] } as never))
      .mockResolvedValueOnce(VALID_OUTPUT)

    const { getAIProviderWithFallback } = await importTarget('@/lib/ai/provider-with-fallback')
    const provider = await getAIProviderWithFallback('company-1')
    const result = await provider.generateEstimate(INPUT)

    expect(result).toEqual(VALID_OUTPUT)
    expect(primaryGenerate).toHaveBeenCalledTimes(2)
  })

  it('second invalid → InvalidEstimateOutputError propagates (invalidOutput: true)', async () => {
    const { InvalidEstimateOutputError } = await importTarget('@/lib/ai/with-fallback')
    primaryGenerate
      .mockRejectedValueOnce(new InvalidEstimateOutputError({ issues: [] } as never))
      .mockRejectedValueOnce(new InvalidEstimateOutputError({ issues: [] } as never))

    const { getAIProviderWithFallback } = await importTarget('@/lib/ai/provider-with-fallback')
    const provider = await getAIProviderWithFallback('company-1')

    await expect(provider.generateEstimate(INPUT)).rejects.toMatchObject({ invalidOutput: true })
  })
})
