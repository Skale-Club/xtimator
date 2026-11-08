import { beforeEach, describe, expect, it, vi } from 'vitest'

const retrieveMock = vi.fn()
vi.mock('@/lib/knowledge/retrieve', () => ({ retrieve: (...a: unknown[]) => retrieveMock(...a) }))

const existsMock = vi.fn()
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: () => ({ select: () => ({ or: () => ({ limit: () => existsMock() }) }) }),
  }),
}))

import { KNOWLEDGE_MIN_SIMILARITY, buildKnowledgeQuery, loadKnowledgeContext } from '@/lib/ai/knowledge-context'

const passage = (n: number) => ({
  id: `p${n}`,
  title: `Title ${n}`,
  body: `Body ${n}`,
  source: null,
  scope: 'company' as const,
  similarity: 0.9,
})

describe('loadKnowledgeContext (SEED-057 E5)', () => {
  beforeEach(() => {
    retrieveMock.mockReset()
    existsMock.mockReset().mockResolvedValue({ data: [{ id: 'k' }], error: null })
  })

  it('asks for the top five and scopes by the trusted company and industries', async () => {
    retrieveMock.mockResolvedValue([passage(1), passage(2)])
    const out = await loadKnowledgeContext({ companyId: 'c1', industries: ['painting'], query: 'repaint the room' })
    expect(retrieveMock).toHaveBeenCalledWith('repaint the room', {
      industries: ['painting'],
      companyId: 'c1',
      k: 5,
      signal: expect.any(AbortSignal),
    })
    expect(out).toEqual([
      { title: 'Title 1', body: 'Body 1' },
      { title: 'Title 2', body: 'Body 2' },
    ])
  })

  it('never returns more than five entries or empty bodies', async () => {
    retrieveMock.mockResolvedValue([...Array.from({ length: 9 }, (_, i) => passage(i)), { ...passage(99), body: '  ' }])
    const out = await loadKnowledgeContext({ companyId: 'c1', industries: [], query: 'q' })
    expect(out).toHaveLength(5)
  })

  it('a retrieval failure is a clean miss', async () => {
    retrieveMock.mockImplementation(async () => {
      throw new Error('embeddings down')
    })
    expect(await loadKnowledgeContext({ companyId: 'c1', industries: [], query: 'q' })).toEqual([])
  })

  it('drops entries under the similarity floor (the RPC always returns its top k)', async () => {
    retrieveMock.mockResolvedValue([
      { ...passage(1), similarity: 0.62 },
      { ...passage(2), similarity: KNOWLEDGE_MIN_SIMILARITY },
      { ...passage(3), similarity: 0.12 },
    ])
    const out = await loadKnowledgeContext({ companyId: 'c1', industries: [], query: 'q' })
    expect(out.map((p) => p.title)).toEqual(['Title 1', 'Title 2'])
  })

  it('skips the embedding call entirely when there is no knowledge to find', async () => {
    existsMock.mockResolvedValue({ data: [], error: null })
    expect(await loadKnowledgeContext({ companyId: 'c1', industries: [], query: 'q' })).toEqual([])
    expect(retrieveMock).not.toHaveBeenCalled()
  })

  it('fails OPEN: if the existence check errors, retrieval still runs', async () => {
    existsMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    retrieveMock.mockResolvedValue([passage(1)])
    expect(await loadKnowledgeContext({ companyId: 'c1', industries: [], query: 'q' })).toHaveLength(1)
    existsMock.mockImplementation(() => {
      throw new Error('db down')
    })
    expect(await loadKnowledgeContext({ companyId: 'c1', industries: [], query: 'q' })).toHaveLength(1)
  })

  it('does not call retrieval for an empty query', async () => {
    expect(await loadKnowledgeContext({ companyId: 'c1', industries: [], query: '  ' })).toEqual([])
    expect(retrieveMock).not.toHaveBeenCalled()
  })

  it('gives up after the time budget instead of holding the estimate', async () => {
    retrieveMock.mockReturnValue(new Promise(() => {}))
    const started = Date.now()
    const out = await loadKnowledgeContext({ companyId: 'c1', industries: [], query: 'q', timeoutMs: 25 })
    expect(out).toEqual([])
    expect(Date.now() - started).toBeLessThan(2_000)
    // The budget cancels the in-flight retrieval/embedding fetch, it does not just stop waiting.
    const ctx = retrieveMock.mock.calls[0][1] as { signal: AbortSignal }
    expect(ctx.signal.aborted).toBe(true)
  })

  it('does not abort the retrieval when it finishes inside the budget', async () => {
    retrieveMock.mockResolvedValue([passage(1)])
    await loadKnowledgeContext({ companyId: 'c1', industries: [], query: 'q' })
    const ctx = retrieveMock.mock.calls[0][1] as { signal: AbortSignal }
    expect(ctx.signal.aborted).toBe(false)
  })
})

describe('buildKnowledgeQuery', () => {
  it('joins the non-empty parts and caps the length', () => {
    expect(buildKnowledgeQuery(['Kitchen', null, '  ', 'two coats'])).toBe('Kitchen\ntwo coats')
    expect(buildKnowledgeQuery(['x'.repeat(5000)])).toHaveLength(800)
  })
})
