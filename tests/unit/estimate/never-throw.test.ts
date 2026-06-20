import { describe, it, expect, vi } from 'vitest'

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
 * RED today: `@/lib/estimate/graph/nodes/generate`, `@/lib/estimate/graph/nodes/decide` and
 * `@/lib/estimate/graph/types` do not exist yet. The `/* @vite-ignore *​/` + computed specifier
 * defeats Vite's transform-time import-analysis so the file COLLECTS cleanly and each test fails
 * at RUN time (real RED). `generateEstimateForProject` is mocked so the assertion targets node
 * behavior. Mirrors the Phase 12/67 Wave-0 scaffold convention.
 */

// Computed specifier so Vite does not statically resolve a not-yet-existent module at transform.
const importTarget = (spec: string) => import(/* @vite-ignore */ spec)

vi.mock('@/lib/services/generate-estimate', () => ({
  generateEstimateForProject: vi.fn(),
}))

describe('ENGINE-04: core nodes never throw (failure-as-state)', () => {
  it('generate node RESOLVES with failure (does not throw) when generation rejects', async () => {
    const { generateEstimateForProject } = await import('@/lib/services/generate-estimate')
    ;(generateEstimateForProject as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('OpenRouter 401 User not found')
    )

    const { makeGenerateNode } = await importTarget('@/lib/estimate/graph/nodes/generate')
    const { passthroughRunner } = await importTarget('@/lib/estimate/graph/types')
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
    const { checkGeneratedEdge } = await importTarget('@/lib/estimate/graph/nodes/decide')

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
