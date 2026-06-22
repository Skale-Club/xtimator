import { describe, it, expect, vi } from 'vitest'

// Heavy real-module imports (LangGraph + adapters + AI providers) loaded at
// runtime via dynamic import. Under vitest's reused forked worker (pool: 'forks')
// these can exceed the 5s default when many files share a worker — import LATENCY
// under contention, not a mock leak. A per-file timeout (test-authoring level, not
// a global config or mock-reset flag) keeps the heavy imports deterministic.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * ENGINE-02 — ChannelAdapter closure-factory.
 *
 * `buildEstimateGraph(adapter, { runner })` accepts a `ChannelAdapter` (a closure-factory
 * mirroring `makeQueryTools(companyId, supabase)`). The adapter exposes ONLY edge behaviors
 * (ingest / finalize / onError); it captures the trusted `companyId` in its closure and
 * NEVER takes a tenant/companyId as a graph-input field (the T-lrf-01 isolation invariant).
 */

import * as graphMod from '@/lib/estimate/graph'
import * as whatsappAdapterMod from '@/lib/estimate/adapters/whatsapp'

describe('ENGINE-02: ChannelAdapter closure-factory', () => {
  it('buildEstimateGraph accepts a ChannelAdapter object and returns a compiled graph', async () => {
    const mod = graphMod
    expect(typeof mod.buildEstimateGraph).toBe('function')

    // A minimal fake adapter exposing the 3 edge behaviors (D-05).
    const adapter = {
      channel: 'whatsapp' as const,
      ingest: async () => ({}),
      finalize: async () => ({}),
      onError: async () => ({}),
    }
    const graph = mod.buildEstimateGraph(adapter)
    // A LangGraph compiled graph exposes invoke().
    expect(typeof (graph as { invoke?: unknown }).invoke).toBe('function')
  })

  it('the WhatsApp adapter is a closure-factory capturing companyId (no tenant input field)', async () => {
    const mod = whatsappAdapterMod
    // Factory mirrors makeQueryTools(companyId, supabase) — companyId is a closure arg.
    expect(typeof mod.makeWhatsAppAdapter).toBe('function')

    const supabase = { from: () => ({}) } as never
    const adapter = mod.makeWhatsAppAdapter({
      companyId: 'company-SECRET',
      supabase,
      ownerPhone: '+15551234567',
    })
    expect(adapter.channel).toBe('whatsapp')
    expect(typeof adapter.ingest).toBe('function')
    expect(typeof adapter.finalize).toBe('function')
    expect(typeof adapter.onError).toBe('function')

    // The trusted companyId must NOT be re-exposed as a graph/adapter input field —
    // it lives only in the closure (mirrors query-tools.test.ts T-lrf-01 Test 1a).
    const surfaceKeys = Object.keys(adapter).map((k) => k.toLowerCase())
    expect(surfaceKeys).not.toContain('company_id')
    expect(surfaceKeys).not.toContain('companyid')
  })
})
