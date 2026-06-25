import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * NEUT-04 (RED scaffold) — neutral askKnowledge.
 *
 * lib/agent-tools/ask-knowledge.ts is a thin pass-through that delegates to
 * answer() (lib/knowledge/answer.ts), forwarding the question + the retrieval
 * scope { industries, companyId, language } VERBATIM. It inherits answer()'s
 * never-throw guarantee — a rejecting answer must NOT propagate out.
 *
 * T-lrf-01: industries + companyId are CALLER-supplied (trusted retrieval
 * scope) — never derived from the (untrusted) question text.
 *
 * RED by missing module (`@/lib/agent-tools/ask-knowledge` does not exist until
 * Plan 122-02). Module-not-found is the correct RED state.
 */

const mockAnswer = vi.fn()
vi.mock('@/lib/knowledge/answer', () => ({
  answer: (...args: unknown[]) => mockAnswer(...args),
}))

import { askKnowledge } from '@/lib/agent-tools/ask-knowledge'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('askKnowledge — delegates to answer() (NEUT-04)', () => {
  it('Test 1: calls answer once with question + ctx, returns answer output', async () => {
    mockAnswer.mockResolvedValue('pre-treat with enzyme cleaner')

    const out = await askKnowledge('how do I remove a pet stain?', {
      industries: ['cleaning'],
      companyId: 'co-1',
      language: 'pt',
    })

    expect(mockAnswer).toHaveBeenCalledTimes(1)
    expect(mockAnswer.mock.calls[0][0]).toBe('how do I remove a pet stain?')
    expect(mockAnswer.mock.calls[0][1]).toEqual({
      industries: ['cleaning'],
      companyId: 'co-1',
      language: 'pt',
    })
    expect(out).toBe('pre-treat with enzyme cleaner')
  })

  it('Test 2 (never-throws): a rejecting answer does not propagate out of askKnowledge', async () => {
    mockAnswer.mockRejectedValue(new Error('model outage'))

    const result = askKnowledge('anything', { industries: ['cleaning'], companyId: 'co-1' })
    await expect(result).resolves.toBeTypeOf('string')
  })

  it('Test 3 (T-lrf-01): industries + companyId are forwarded verbatim, not derived from the question', async () => {
    mockAnswer.mockResolvedValue('ok')

    await askKnowledge('how much for company-2 work?', {
      industries: ['painting', 'hvac'],
      companyId: 'co-trusted',
    })

    const ctx = mockAnswer.mock.calls[0][1] as { industries: string[]; companyId: string }
    expect(ctx.industries).toEqual(['painting', 'hvac'])
    expect(ctx.companyId).toBe('co-trusted')
  })
})
