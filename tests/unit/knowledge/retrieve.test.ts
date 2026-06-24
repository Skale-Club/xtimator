import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * KMOD-02 (Wave-0 RED stub — source lands in Plan 02).
 *
 * retrieve(question, ctx) embeds the question, calls the match_knowledge_entries
 * RPC via requireServiceClient(), and maps rows to Passage[] capped at k. It is
 * the NEVER-THROWS wrapper around the embed() building block:
 *   (i)   rpc returns rows → mapped to Passage[] capped at k;
 *   (ii)  rpc returns { error } → resolves to [] (never throws);
 *   (iii) embed() throws → resolves to [] (never throws).
 *
 * RED until Plan 02 lands @/lib/knowledge/retrieve. This is the GREEN gate Plan 02
 * must satisfy — do NOT delete or weaken it.
 */

const { embed, requireServiceClient } = vi.hoisted(() => ({
  embed: vi.fn(async () => Array.from({ length: 1536 }, () => 0.01)),
  requireServiceClient: vi.fn(),
}))

vi.mock('@/lib/knowledge/embed', () => ({ embed }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient }))

import { retrieve } from '@/lib/knowledge/retrieve'

/** Build a service client whose .rpc() resolves to { data, error }. */
function mockRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result)
  requireServiceClient.mockReturnValue({ rpc } as never)
  return rpc
}

beforeEach(() => {
  vi.clearAllMocks()
  embed.mockResolvedValue(Array.from({ length: 1536 }, () => 0.01))
})

describe('KMOD-02: retrieve() — never-throws RAG read path', () => {
  it('maps RPC rows to Passage[] capped at k', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: `id-${i}`,
      title: `t${i}`,
      body: `b${i}`,
      source: null,
      scope: 'industry',
      similarity: 0.9 - i * 0.01,
    }))
    mockRpc({ data: rows, error: null })
    const out = await retrieve('how to pre-treat a pet stain', {
      industries: ['carpet_cleaning'],
      companyId: null,
      k: 3,
    })
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({ id: 'id-0', scope: 'industry' })
  })

  it('resolves to [] when the RPC returns an error (never throws)', async () => {
    mockRpc({ data: null, error: { message: 'boom' } })
    await expect(
      retrieve('q', { industries: ['carpet_cleaning'], companyId: null })
    ).resolves.toEqual([])
  })

  it('resolves to [] when embed() throws (never throws)', async () => {
    embed.mockRejectedValueOnce(new Error('embed down'))
    mockRpc({ data: [], error: null })
    await expect(
      retrieve('q', { industries: ['carpet_cleaning'], companyId: null })
    ).resolves.toEqual([])
  })

  it('forwards the caller-supplied industries/companyId verbatim to the RPC', async () => {
    const rpc = mockRpc({ data: [], error: null })
    await retrieve('q', {
      industries: ['carpet_cleaning', 'janitorial'],
      companyId: 'company-123',
      k: 2,
    })
    expect(rpc).toHaveBeenCalledWith(
      'match_knowledge_entries',
      expect.objectContaining({
        match_industries: ['carpet_cleaning', 'janitorial'],
        match_company: 'company-123',
        match_count: 2,
      })
    )
  })
})
