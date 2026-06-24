import { describe, it, expect } from 'vitest'

/**
 * KMOD-04 (Wave-0 RED stub — source lands in Plan 02).
 *
 * The fixture KnowledgeProvider is the determinism seam: a network-free,
 * deterministic implementation of the KnowledgeProvider port for CI.
 *   - embed() returns a 1536-length array WITHOUT any network call;
 *   - two retrieve() calls with the same fixtures + question return identical
 *     results (deterministic);
 *   - a question absent from the fixtures returns [].
 *
 * RED until Plan 02 lands @/lib/knowledge/adapters/fixture. This is the GREEN gate
 * Plan 02 must satisfy — do NOT delete or weaken it.
 */

import { makeFixtureKnowledgeProvider } from '@/lib/knowledge/adapters/fixture'
import type { Passage } from '@/lib/knowledge/provider'

const FIXTURES: Passage[] = [
  {
    id: 'f1',
    title: 'Pet stain pre-treatment',
    body: 'Blot, then apply an enzymatic cleaner.',
    source: null,
    scope: 'industry',
    similarity: 1,
  },
]

describe('KMOD-04: fixture KnowledgeProvider determinism', () => {
  it('embed() returns a 1536-length array, network-free', async () => {
    const provider = makeFixtureKnowledgeProvider({
      'how do I pre-treat a pet stain?': FIXTURES,
    })
    const v = await provider.embed('anything')
    expect(v).toHaveLength(1536)
  })

  it('retrieve() is deterministic across repeated calls', async () => {
    const provider = makeFixtureKnowledgeProvider({
      'how do I pre-treat a pet stain?': FIXTURES,
    })
    const ctx = { industries: ['carpet_cleaning'], companyId: null }
    const a = await provider.retrieve('how do I pre-treat a pet stain?', ctx)
    const b = await provider.retrieve('how do I pre-treat a pet stain?', ctx)
    expect(a).toEqual(b)
    expect(a).toEqual(FIXTURES)
  })

  it('returns [] for a question absent from the fixtures', async () => {
    const provider = makeFixtureKnowledgeProvider({
      'how do I pre-treat a pet stain?': FIXTURES,
    })
    const out = await provider.retrieve('unrelated question', {
      industries: ['carpet_cleaning'],
      companyId: null,
    })
    expect(out).toEqual([])
  })
})
