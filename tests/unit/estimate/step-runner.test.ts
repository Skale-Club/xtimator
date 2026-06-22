import { describe, it, expect, vi } from 'vitest'

// Heavy real-module imports (LangGraph + adapters) loaded at runtime via dynamic
// import. Under vitest's reused forked worker (pool: 'forks') these can exceed the
// 5s default when many files share a worker — import LATENCY under contention, not
// a mock leak. Per-file timeout (test-authoring level, not a global config or
// mock-reset flag) keeps the heavy imports deterministic.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * DURABLE-01 — the `StepRunner` seam: `run<T>(name, fn): Promise<T>`.
 *
 * The DEFAULT `passthroughRunner` just calls `fn()` so behavior is unchanged today. The graph
 * builder accepts an injected runner via `buildEstimateGraph(adapter, { runner })`. No node is
 * decomposed this phase — scaffold only. Later the Inngest function injects
 * `{ run: (name, fn) => step.run(name, fn) }`.
 */

import { passthroughRunner } from '@/lib/estimate/graph/types'
import { buildEstimateGraph } from '@/lib/estimate/graph'

describe('DURABLE-01: passthroughRunner', () => {
  it('passthroughRunner.run(name, fn) returns fn() resolved value unchanged', async () => {
    const fn = vi.fn(async () => 'the-value')
    const out = await passthroughRunner.run('ai-generate', fn)

    expect(out).toBe('the-value')
    // No wrapping / extra invocations — exactly one call, passed through verbatim.
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('passthroughRunner propagates rejection from fn (no swallowing)', async () => {
    await expect(
      passthroughRunner.run('x', async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
  })
})

describe('DURABLE-01: runner injection into buildEstimateGraph', () => {
  it('buildEstimateGraph(adapter, { runner }) accepts an injected StepRunner', async () => {
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
