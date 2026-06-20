import { describe, it, expect } from 'vitest'

/**
 * ENGINE-02 (Wave 0 RED stub — source lands in Wave 2/3).
 *
 * `buildEstimateGraph(adapter, { runner })` accepts a `ChannelAdapter` (a closure-factory
 * mirroring `makeQueryTools(companyId, supabase)`). The adapter exposes ONLY edge behaviors
 * (ingest / finalize / onError); it captures the trusted `companyId` in its closure and
 * NEVER takes a tenant/companyId as a graph-input field (the T-lrf-01 isolation invariant).
 *
 * RED today: `@/lib/estimate/graph` and `@/lib/estimate/adapters/whatsapp` do not exist. The
 * `/* @vite-ignore *​/` + computed specifier defeats Vite's transform-time import-analysis so
 * the file COLLECTS cleanly and each test fails at RUN time (real RED), becoming the GREEN gate
 * once Wave 2/3 lands the source. Mirrors the Phase 12/67 Wave-0 scaffold convention.
 */

// Computed specifier so Vite does not statically resolve a not-yet-existent module at transform.
const importTarget = (spec: string) => import(/* @vite-ignore */ spec)

describe('ENGINE-02: ChannelAdapter closure-factory', () => {
  it('buildEstimateGraph accepts a ChannelAdapter object and returns a compiled graph', async () => {
    const mod = await importTarget('@/lib/estimate/graph')
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
    const mod = await importTarget('@/lib/estimate/adapters/whatsapp')
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
