import { beforeEach, describe, expect, it, vi } from 'vitest'

// SEED-057 D: at the single final-vague terminal, the clarifying questions come
// from the estimator's own open_questions first; the classification call only
// runs when it raised none.

const buildNeedsDetailsMock = vi.fn()
vi.mock('@/lib/ai/needs-details', () => ({ buildNeedsDetails: (...a: unknown[]) => buildNeedsDetailsMock(...a) }))
vi.mock('@/lib/estimate/quality/revert', () => ({ revertVagueEstimate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/queries/recording', () => ({ getProjectRecordings: vi.fn().mockResolvedValue([{ transcript: 'fix the thing' }]) }))
vi.mock('@/lib/queries/photo', () => ({ getProjectPhotos: vi.fn().mockResolvedValue([]) }))

import { makeDefaultAdapter } from '@/lib/estimate/adapters/default'
import type { EstimateStateType } from '@/lib/estimate/graph/state'

function makeSupabase() {
  const updates: Array<Record<string, unknown>> = []
  const chain = () => {
    const c: Record<string, unknown> = {}
    c.eq = vi.fn(() => c)
    c.maybeSingle = vi.fn().mockResolvedValue({ data: { industry: 'painting' }, error: null })
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
    return c
  }
  const from = vi.fn(() => ({
    update: vi.fn((row: Record<string, unknown>) => {
      updates.push(row)
      return chain()
    }),
    select: vi.fn(() => chain()),
  }))
  return { client: { from } as never, updates }
}

const base = { companyId: 'c', projectId: 'p', channel: 'web', isVague: true, refineAttempts: 1, estimateLanguage: 'en' }

describe('default adapter finalize: needs-details source', () => {
  beforeEach(() => buildNeedsDetailsMock.mockReset())

  it('uses the estimator open questions and skips the classification call', async () => {
    const { client, updates } = makeSupabase()
    const out = await makeDefaultAdapter({ companyId: 'c', supabase: client }).finalize({
      ...base,
      openQuestions: ['How many rooms?', 'What is the ceiling height?', 'Is there a garage?', 'Interior or exterior?', 'A fifth one'],
    } as unknown as EstimateStateType)

    expect(out).toEqual({ needsDetails: true })
    // 1.2: the deleted estimate's id must be CLEARED from state (an explicit
    // `undefined` clears the last-value channel), not merely left unmentioned.
    expect(out).toHaveProperty('estimateId', undefined)
    expect(buildNeedsDetailsMock).not.toHaveBeenCalled()
    const row = updates.find((u) => 'needs_details' in u)!
    expect(row.needs_details).toMatchObject({
      reason: 'missing_specifics',
      questions: ['How many rooms?', 'What is the ceiling height?', 'Is there a garage?', 'Interior or exterior?'],
    })
  })

  it('clears the deleted estimate id from graph state on the final-vague path', async () => {
    const { client } = makeSupabase()
    const out = await makeDefaultAdapter({ companyId: 'c', supabase: client }).finalize({
      ...base,
      estimateId: 'deleted-est',
      openQuestions: ['q?'],
    } as unknown as EstimateStateType)
    expect(Object.prototype.hasOwnProperty.call(out, 'estimateId')).toBe(true)
    expect(out.estimateId).toBeUndefined()
    expect(out.needsDetails).toBe(true)
  })

  it('falls back to the classification call when the estimator raised none', async () => {
    buildNeedsDetailsMock.mockResolvedValue({ reason: 'mic_test', questions: [] })
    const { client, updates } = makeSupabase()
    await makeDefaultAdapter({ companyId: 'c', supabase: client }).finalize({ ...base, openQuestions: [] } as unknown as EstimateStateType)

    expect(buildNeedsDetailsMock).toHaveBeenCalledOnce()
    expect(updates.find((u) => 'needs_details' in u)!.needs_details).toMatchObject({ reason: 'mic_test' })
  })

  it('does nothing on the success path', async () => {
    const { client } = makeSupabase()
    const out = await makeDefaultAdapter({ companyId: 'c', supabase: client }).finalize({
      ...base,
      isVague: false,
      openQuestions: ['x'],
    } as unknown as EstimateStateType)
    expect(out).toEqual({})
    expect(buildNeedsDetailsMock).not.toHaveBeenCalled()
  })
})
