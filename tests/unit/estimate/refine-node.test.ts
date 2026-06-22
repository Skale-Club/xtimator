import { describe, it, expect, vi, beforeEach } from 'vitest'

// Heavy real-module imports; under vitest's reused forked worker they can exceed
// the 5s default (import latency under contention, not a mock leak). Per-file
// timeout keeps them deterministic.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * UNIFY-03 — core refine node never throws (failure-as-state).
 *
 * `makeRefineNode(runner)` mirrors `makeGenerateNode`: it wraps the AI refine call in the
 * injected StepRunner and NEVER throws. On success it RESOLVES with `{ refined: EstimateOutput }`.
 * On failure it RESOLVES with a typed `{ failure: { reason } }`, mapping the markers exactly like
 * the generate node:
 *   - ProvidersUnavailableError  -> 'provider_unavailable'
 *   - InvalidEstimateOutputError -> 'invalid_output'
 *   - missing existingEstimate / instruction -> 'no_usable_input'
 *   - any other error -> 'generation_failed'
 *
 * The refine node resolves the fallback-aware provider via `getAIProviderWithFallback(companyId)`
 * (inheriting Phase-99 fallback + Phase-100 schema-retry) and reads the price book by companyId.
 * Both are mocked here so assertions target node behavior, not the network. The static import of
 * the module-under-test is below the vi.mock calls (which vitest hoists), so the mocks
 * deterministically intercept the node's dependencies.
 */

import { ProvidersUnavailableError, InvalidEstimateOutputError } from '@/lib/ai/with-fallback'
import { makeRefineNode } from '@/lib/estimate/graph/nodes/refine'

const mockRefineEstimate = vi.fn()

vi.mock('@/lib/ai/provider-with-fallback', () => ({
  getAIProviderWithFallback: vi.fn(async () => ({
    refineEstimate: (...args: unknown[]) => mockRefineEstimate(...args),
  })),
}))

vi.mock('@/lib/queries/price-book', () => ({
  getPriceBookItems: vi.fn(async () => []),
}))

// The refine node calls requireServiceClient() to resolve company language/
// currency/industry. Without this mock it throws in a secret-free environment
// (no Supabase env, e.g. CI) — passing locally only because .env.local is
// loaded. Stub it so the company-row lookup returns no data (node keeps neutral
// defaults) and never depends on real Supabase credentials.
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}))

const passthroughRunner = { run: <T>(_name: string, fn: () => Promise<T>) => fn() }

const validRefinedOutput = {
  suggested_project_name: 'Refined Project',
  suggested_client_name: null,
  summary: 'Refined summary',
  sections: [
    {
      title: 'Labor',
      items: [
        {
          description: 'Cleanup labor',
          quantity: 2,
          unit: 'hr',
          unit_price: 65,
          price_source: 'ai_estimate' as const,
        },
      ],
    },
  ],
}

const baseState = {
  companyId: 'company-1',
  projectId: 'project-1',
  channel: 'web' as const,
  existingEstimate: { ...validRefinedOutput, summary: 'Original' },
  instruction: 'Add cleanup labor.',
}

describe('UNIFY-03: makeRefineNode never throws + maps failures to typed reasons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('success -> resolves { refined: EstimateOutput }', async () => {
    mockRefineEstimate.mockResolvedValueOnce(validRefinedOutput)

    const node = makeRefineNode(passthroughRunner)
    const result = await node({ ...baseState } as never)

    expect((result as { refined?: unknown }).refined).toEqual(validRefinedOutput)
    expect((result as { failure?: unknown }).failure).toBeUndefined()
  })

  it('ProvidersUnavailableError -> { failure: { reason: "provider_unavailable" } } (never throws)', async () => {
    mockRefineEstimate.mockRejectedValueOnce(
      new ProvidersUnavailableError('both providers down', new Error('PRIMARY_ERR'))
    )

    const node = makeRefineNode(passthroughRunner)

    let result: unknown
    await expect(
      (async () => {
        result = await node({ ...baseState } as never)
      })()
    ).resolves.not.toThrow()

    expect((result as { failure?: { reason: string } }).failure?.reason).toBe('provider_unavailable')
  })

  it('InvalidEstimateOutputError -> { failure: { reason: "invalid_output" } }', async () => {
    mockRefineEstimate.mockRejectedValueOnce(
      new InvalidEstimateOutputError({ issues: [] } as never)
    )

    const node = makeRefineNode(passthroughRunner)
    const result = await node({ ...baseState } as never)

    expect((result as { failure?: { reason: string } }).failure?.reason).toBe('invalid_output')
  })

  it('missing existingEstimate or instruction -> { failure: { reason: "no_usable_input" } }', async () => {
    const node = makeRefineNode(passthroughRunner)

    const missingInstruction = await node({
      companyId: 'company-1',
      projectId: 'project-1',
      channel: 'web',
      existingEstimate: baseState.existingEstimate,
      instruction: undefined,
    } as never)
    expect((missingInstruction as { failure?: { reason: string } }).failure?.reason).toBe(
      'no_usable_input'
    )

    const missingEstimate = await node({
      companyId: 'company-1',
      projectId: 'project-1',
      channel: 'web',
      existingEstimate: undefined,
      instruction: 'Add cleanup labor.',
    } as never)
    expect((missingEstimate as { failure?: { reason: string } }).failure?.reason).toBe(
      'no_usable_input'
    )

    // refine must NOT have been attempted when input is unusable.
    expect(mockRefineEstimate).not.toHaveBeenCalled()
  })

  it('any other error -> { failure: { reason: "generation_failed" } }', async () => {
    mockRefineEstimate.mockRejectedValueOnce(new Error('something unexpected'))

    const node = makeRefineNode(passthroughRunner)
    const result = await node({ ...baseState } as never)

    expect((result as { failure?: { reason: string } }).failure?.reason).toBe('generation_failed')
  })
})
