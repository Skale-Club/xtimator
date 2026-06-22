import { describe, it, expect, vi } from 'vitest'

// Heavy real-module imports loaded at runtime via dynamic import; under vitest's
// reused forked worker they can exceed the 5s default (import latency under
// contention, not a mock leak). Per-file timeout keeps them deterministic.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * ENGINE-04 (Wave 0 RED stub — source lands in Wave 2).
 *
 * The core nodes NEVER throw. Failure becomes a `failure?` state channel:
 *   - `generate`: when `generateEstimateForProject` rejects, the node RESOLVES with
 *     `{ failure: { reason: ... } }` (it does NOT throw) — preserving the never-throw
 *     guarantee that today's WhatsApp graph implements via `generationFailed`.
 *   - `decide` (checkGenerated edge): a state with `failure` set routes to the adapter
 *     `onError` terminal, not to the vagueness/success path.
 *
 * `generateEstimateForProject` is mocked so the assertion targets node behavior.
 * The modules-under-test are imported statically below the vi.mock call (which
 * vitest hoists), so the mock deterministically intercepts the node's dependency.
 */

import { ProvidersUnavailableError, InvalidEstimateOutputError } from '@/lib/ai/with-fallback'
import { makeGenerateNode } from '@/lib/estimate/graph/nodes/generate'
import { checkGeneratedEdge } from '@/lib/estimate/graph/nodes/decide'
import { passthroughRunner } from '@/lib/estimate/graph/types'

vi.mock('@/lib/services/generate-estimate', () => ({
  generateEstimateForProject: vi.fn(),
}))

describe('ENGINE-04: core nodes never throw (failure-as-state)', () => {
  it('generate node RESOLVES with failure (does not throw) when generation rejects', async () => {
    const { generateEstimateForProject } = await import('@/lib/services/generate-estimate')
    ;(generateEstimateForProject as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('OpenRouter 401 User not found')
    )

    const node = makeGenerateNode(passthroughRunner)

    // Must RESOLVE (never reject) and carry a failure channel.
    const result = await node({
      companyId: 'company-1',
      projectId: 'project-1',
      channel: 'whatsapp',
    } as never)

    expect(result).toHaveProperty('failure')
    expect((result as { failure?: { reason: string } }).failure?.reason).toBeTruthy()
  })

  it('decide routes a state with failure set to the error terminal (not the success path)', async () => {
    const failed = checkGeneratedEdge({
      failure: { reason: 'generation_failed' },
      estimateId: undefined,
    } as never)
    // Routes to the terminal failure branch — NOT the vagueness/assess path.
    expect(failed).not.toBe('assess')
    expect(failed).not.toBe('evaluateVagueness')

    const ok = checkGeneratedEdge({
      failure: undefined,
      estimateId: 'est-1',
    } as never)
    expect(ok).not.toBe(failed)
  })
})

/**
 * HARD-04 invariant — both-providers-down resolves to a typed failure.
 *
 * When the shared OpenRouter→Gemini fallback wrapper exhausts BOTH providers it
 * re-throws a marked `ProvidersUnavailableError`. The generate node's existing
 * never-throw catch must (a) still NOT throw, and (b) map that marker to the
 * typed reason `'provider_unavailable'`.
 */
describe('HARD-04: both providers down -> typed provider_unavailable failure', () => {
  it('both providers down — graph resolves to a failure state and does not throw (no throw)', async () => {
    const { generateEstimateForProject } = await import('@/lib/services/generate-estimate')
    ;(generateEstimateForProject as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ProvidersUnavailableError('both providers down', new Error('PRIMARY_ERR'))
    )

    const node = makeGenerateNode(passthroughRunner)

    let result: unknown
    await expect(
      (async () => {
        result = await node({
          companyId: 'company-1',
          projectId: 'project-1',
          channel: 'whatsapp',
        } as never)
      })()
    ).resolves.not.toThrow()

    // Presence only — the graph landed in a failure state instead of throwing.
    expect((result as { failure?: unknown }).failure).toBeDefined()
  })

  it('both providers down — failure.reason is exactly provider_unavailable', async () => {
    const { generateEstimateForProject } = await import('@/lib/services/generate-estimate')
    ;(generateEstimateForProject as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ProvidersUnavailableError('both providers down', new Error('PRIMARY_ERR'))
    )

    const node = makeGenerateNode(passthroughRunner)

    const result = await node({
      companyId: 'company-1',
      projectId: 'project-1',
      channel: 'whatsapp',
    } as never)

    // EXACT string — 99-02 owns the marker -> typed-reason mapping in generate.ts.
    expect((result as { failure?: { reason: string } }).failure?.reason).toBe('provider_unavailable')
  })
})

/**
 * GUARD-01 invariant — invalid AI output resolves to a typed invalid_output failure.
 *
 * When the schema-retry boundary exhausts its single retry it throws a marked
 * `InvalidEstimateOutputError` (`invalidOutput: true`), imported here from
 * `@/lib/ai/with-fallback`. The generate node's existing never-throw catch must
 * (a) still NOT throw, and (b) map that marker to the already-declared typed
 * reason `'invalid_output'` (`lib/estimate/failure.ts`).
 */
describe('GUARD-01: invalid output -> typed invalid_output failure', () => {
  it('invalid output — graph resolves to a failure state and does not throw (no throw)', async () => {
    const { generateEstimateForProject } = await import('@/lib/services/generate-estimate')
    ;(generateEstimateForProject as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new InvalidEstimateOutputError({ issues: [] } as never)
    )

    const node = makeGenerateNode(passthroughRunner)

    let result: unknown
    await expect(
      (async () => {
        result = await node({
          companyId: 'company-1',
          projectId: 'project-1',
          channel: 'whatsapp',
        } as never)
      })()
    ).resolves.not.toThrow()

    expect((result as { failure?: unknown }).failure).toBeDefined()
  })

  it('invalid output — failure.reason is exactly invalid_output', async () => {
    const { generateEstimateForProject } = await import('@/lib/services/generate-estimate')
    ;(generateEstimateForProject as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new InvalidEstimateOutputError({ issues: [] } as never)
    )

    const node = makeGenerateNode(passthroughRunner)

    const result = await node({
      companyId: 'company-1',
      projectId: 'project-1',
      channel: 'whatsapp',
    } as never)

    // EXACT string — 100-01 owns the marker -> typed-reason mapping in generate.ts.
    expect((result as { failure?: { reason: string } }).failure?.reason).toBe('invalid_output')
  })
})
