import { describe, it, expect, vi } from 'vitest'

// Heavy real-module imports loaded at runtime via dynamic import; under vitest's
// reused forked worker they can exceed the 5s default (import latency under
// contention, not a mock leak). Per-file timeout keeps them deterministic.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * ENGINE-03 (Wave 0 RED stub — source lands in Wave 2).
 *
 * `isVagueEstimate` moves verbatim from `lib/whatsapp/ask-details.ts` into the channel-neutral
 * `lib/estimate/quality/vagueness.ts`. The truth table below is copied from
 * `tests/unit/whatsapp/ask-details.test.ts` to prove the moved function is byte-identical in
 * behavior. The old `@/lib/whatsapp/ask-details` import keeps working via a re-export (D-03),
 * which `ask-details.test.ts` continues to verify.
 *
 * RED today: `@/lib/estimate/quality/vagueness` does not exist yet. The `/* @vite-ignore *​/` +
 * computed specifier defeats Vite's transform-time import-analysis so the file COLLECTS cleanly
 * and each test fails at RUN time (real RED). Mirrors the Phase 12/67 Wave-0 scaffold convention.
 */

// Computed specifier so Vite does not statically resolve a not-yet-existent module at transform.
const importTarget = (spec: string) => import(/* @vite-ignore */ spec)

async function loadIsVagueEstimate() {
  const mod = await importTarget('@/lib/estimate/quality/vagueness')
  return mod.isVagueEstimate as (
    e: { total: number | null; sections: Array<{ items?: Array<unknown> | null }> | null } | null
  ) => boolean
}

describe('ENGINE-03: isVagueEstimate at the shared path (@/lib/estimate/quality/vagueness)', () => {
  it('true when total is 0 (with items)', async () => {
    const isVagueEstimate = await loadIsVagueEstimate()
    expect(isVagueEstimate({ total: 0, sections: [{ items: [{}] }] })).toBe(true)
  })

  it('true when total is null', async () => {
    const isVagueEstimate = await loadIsVagueEstimate()
    expect(isVagueEstimate({ total: null, sections: [{ items: [{}] }] })).toBe(true)
  })

  it('true when sections have empty items', async () => {
    const isVagueEstimate = await loadIsVagueEstimate()
    expect(isVagueEstimate({ total: 100, sections: [{ items: [] }] })).toBe(true)
  })

  it('true when sections is null', async () => {
    const isVagueEstimate = await loadIsVagueEstimate()
    expect(isVagueEstimate({ total: 100, sections: null })).toBe(true)
  })

  it('true when estimate is null', async () => {
    const isVagueEstimate = await loadIsVagueEstimate()
    expect(isVagueEstimate(null)).toBe(true)
  })

  it('false when total > 0 and at least one item exists', async () => {
    const isVagueEstimate = await loadIsVagueEstimate()
    expect(isVagueEstimate({ total: 100, sections: [{ items: [{}] }] })).toBe(false)
  })
})
