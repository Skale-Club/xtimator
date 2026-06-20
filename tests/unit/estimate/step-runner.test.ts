import { describe, it, expect, vi } from 'vitest'

/**
 * DURABLE-01 (Wave 0 RED stub — source lands in Wave 2).
 *
 * The `StepRunner` seam: `run<T>(name, fn): Promise<T>`. The DEFAULT `passthroughRunner`
 * just calls `fn()` so behavior is unchanged today. The graph builder accepts an injected
 * runner via `buildEstimateGraph(adapter, { runner })`. No node is decomposed this phase —
 * scaffold only. Later the Inngest function injects `{ run: (name, fn) => step.run(name, fn) }`.
 *
 * RED today: `@/lib/estimate/graph/types` and `@/lib/estimate/graph` do not exist yet. The
 * `/* @vite-ignore *​/` + computed specifier defeats Vite's transform-time import-analysis so the
 * file COLLECTS cleanly and each test fails at RUN time (real RED). Mirrors the Phase 12/67
 * Wave-0 scaffold convention.
 */

// Computed specifier so Vite does not statically resolve a not-yet-existent module at transform.
const importTarget = (spec: string) => import(/* @vite-ignore */ spec)

describe('DURABLE-01: passthroughRunner', () => {
  it('passthroughRunner.run(name, fn) returns fn() resolved value unchanged', async () => {
    const { passthroughRunner } = await importTarget('@/lib/estimate/graph/types')

    const fn = vi.fn(async () => 'the-value')
    const out = await passthroughRunner.run('ai-generate', fn)

    expect(out).toBe('the-value')
    // No wrapping / extra invocations — exactly one call, passed through verbatim.
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('passthroughRunner propagates rejection from fn (no swallowing)', async () => {
    const { passthroughRunner } = await importTarget('@/lib/estimate/graph/types')
    await expect(
      passthroughRunner.run('x', async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
  })
})

describe('DURABLE-01: runner injection into buildEstimateGraph', () => {
  it('buildEstimateGraph(adapter, { runner }) accepts an injected StepRunner', async () => {
    const { buildEstimateGraph } = await importTarget('@/lib/estimate/graph')

    const runner = { run: vi.fn(async (_n: string, fn: () => Promise<unknown>) => fn()) }
    const adapter = {
      channel: 'whatsapp' as const,
      ingest: async () => ({}),
      finalize: async () => ({}),
      onError: async () => ({}),
    }
    const graph = buildEstimateGraph(adapter, { runner })
    expect(typeof (graph as { invoke?: unknown }).invoke).toBe('function')
  })
})
