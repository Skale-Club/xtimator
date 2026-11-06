import { beforeEach, describe, expect, it, vi } from 'vitest'

const retrieveMock = vi.fn()
vi.mock('@/lib/knowledge/retrieve', () => ({ retrieve: (...a: unknown[]) => retrieveMock(...a) }))

import { buildKnowledgeQuery, loadKnowledgeContext } from '@/lib/ai/knowledge-context'

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
  })

  it('asks for the top five and scopes by the trusted company and industries', async () => {
    retrieveMock.mockResolvedValue([passage(1), passage(2)])
    const out = await loadKnowledgeContext({ companyId: 'c1', industries: ['painting'], query: 'repaint the room' })
    expect(retrieveMock).toHaveBeenCalledWith('repaint the room', { industries: ['painting'], companyId: 'c1', k: 5 })
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
  })
})

describe('buildKnowledgeQuery', () => {
  it('joins the non-empty parts and caps the length', () => {
    expect(buildKnowledgeQuery(['Kitchen', null, '  ', 'two coats'])).toBe('Kitchen\ntwo coats')
    expect(buildKnowledgeQuery(['x'.repeat(5000)])).toHaveLength(800)
  })
})
