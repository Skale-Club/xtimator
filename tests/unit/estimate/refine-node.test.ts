import { describe, it, expect, vi, beforeEach } from 'vitest'

// Heavy real-module imports loaded at runtime via dynamic import; under vitest's
// reused forked worker they can exceed the 5s default (import latency under
// contention, not a mock leak). Per-file timeout keeps them deterministic.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * UNIFY-03 — core refine node never throws (failure-as-state). Wave 0 RED; source lands in Wave 2.
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
 * Both are mocked here so assertions target node behavior, not the network.
 *
 * RED today: `@/lib/estimate/graph/nodes/refine` does not exist yet. The computed-specifier
 * `importTarget` + `/* @vite-ignore *​/` keeps collection clean; tests fail at RUN time (real RED).
 * The markers come from `@/lib/ai/with-fallback` (already exists) — a normal static import.
 *
 * Wave-2 owner: 101-02 (makeRefineNode implementation).
 */

import { ProvidersUnavailableError, InvalidEstimateOutputError } from '@/lib/ai/with-fallback'

// Computed specifier so Vite does not statically resolve a not-yet-existent module at transform.
const importTarget = (spec: string) => import(/* @vite-ignore */ spec)

const mockRefineEstimate = vi.fn()

vi.mock('@/lib/ai/provider-with-fallback', () => ({
  getAIProviderWithFallback: vi.fn(async () => ({
    refineEstimate: (...args: unknown[]) => mockRefineEstimate(...args),
  })),
}))

vi.mock('@/lib/queries/price-book', () => ({
  getPriceBookItems: vi.fn(async () => []),
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
    const { makeRefineNode } = await importTarget('@/lib/estimate/graph/nodes/refine')
    mockRefineEstimate.mockResolvedValueOnce(validRefinedOutput)

    const node = makeRefineNode(passthroughRunner)
    const result = await node({ ...baseState } as never)

    expect((result as { refined?: unknown }).refined).toEqual(validRefinedOutput)
    expect((result as { failure?: unknown }).failure).toBeUndefined()
  })

  it('ProvidersUnavailableError -> { failure: { reason: "provider_unavailable" } } (never throws)', async () => {
    const { makeRefineNode } = await importTarget('@/lib/estimate/graph/nodes/refine')
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
    const { makeRefineNode } = await importTarget('@/lib/estimate/graph/nodes/refine')
    mockRefineEstimate.mockRejectedValueOnce(
      new InvalidEstimateOutputError({ issues: [] } as never)
    )

    const node = makeRefineNode(passthroughRunner)
    const result = await node({ ...baseState } as never)

    expect((result as { failure?: { reason: string } }).failure?.reason).toBe('invalid_output')
  })

  it('missing existingEstimate or instruction -> { failure: { reason: "no_usable_input" } }', async () => {
    const { makeRefineNode } = await importTarget('@/lib/estimate/graph/nodes/refine')
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
    const { makeRefineNode } = await importTarget('@/lib/estimate/graph/nodes/refine')
    mockRefineEstimate.mockRejectedValueOnce(new Error('something unexpected'))

    const node = makeRefineNode(passthroughRunner)
    const result = await node({ ...baseState } as never)

    expect((result as { failure?: { reason: string } }).failure?.reason).toBe('generation_failed')
  })
})
