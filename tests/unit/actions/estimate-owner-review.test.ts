import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: async () => 'company-1' }))
vi.mock('@/lib/queries/estimate', () => ({ getEstimateById: vi.fn() }))
vi.mock('@/lib/auth/platform-admin', () => ({ isPlatformAdmin: vi.fn() }))
vi.mock('@/lib/integrations/xphere/dispatch', () => ({ dispatchXphereSync: vi.fn() }))

import { getEstimateByIdAction } from '@/lib/actions/estimate'
import { isPlatformAdmin } from '@/lib/auth/platform-admin'
import { getEstimateById } from '@/lib/queries/estimate'
import { createClient } from '@/lib/supabase/server'

const ESTIMATE = {
  id: 'estimate-1',
  summary: 'Paint the kitchen',
  ai_meta: {
    v: 1,
    assumptions: ['Owner provides paint.'],
    open_questions: [{ question: 'Is the closet included?', impact: 'high' }],
    source_notes: ['Private source note'],
    quality: { score: 42, band: 'review', findings: ['Private structure finding'] },
  },
  owner_review: { questions: ['Stale review text'] },
  sections: [{ items: [{ description: 'Prep walls', unit_price: 0, confidence: 'low' }] }],
}

const expectedReview = {
  questions: ['Is the closet included?'],
  assumptions: ['Owner provides paint.'],
  needsReview: true,
  lowConfidenceLines: 1,
  unpricedLines: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockResolvedValue({
    auth: { getClaims: async () => ({ data: { claims: { sub: 'user-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'company-1' } }) }) }),
    }),
  } as never)
  vi.mocked(getEstimateById).mockResolvedValue(ESTIMATE as never)
  vi.mocked(isPlatformAdmin).mockResolvedValue(false)
})

describe('getEstimateByIdAction owner review', () => {
  it('derives a safe review from the requested version for an ordinary owner', async () => {
    const { data } = await getEstimateByIdAction('estimate-1')

    expect(getEstimateById).toHaveBeenCalledWith(expect.any(Object), 'estimate-1')
    expect(data?.owner_review).toEqual(expectedReview)
    expect(data).not.toHaveProperty('ai_meta')
    expect(JSON.stringify(data)).not.toContain('Private source note')
    expect(JSON.stringify(data)).not.toContain('Private structure finding')
    expect(data?.summary).toBe('Paint the kitchen')
  })

  it('keeps admin diagnostics as a separate record from the owner review', async () => {
    vi.mocked(isPlatformAdmin).mockResolvedValue(true)

    const { data } = await getEstimateByIdAction('estimate-1')

    expect(data?.owner_review).toEqual(expectedReview)
    expect(data?.ai_meta).toEqual(ESTIMATE.ai_meta)
  })

  it('returns no review when the requested version is inaccessible', async () => {
    vi.mocked(getEstimateById).mockResolvedValue(null)

    expect(await getEstimateByIdAction('estimate-1')).toEqual({ error: 'Estimate not found' })
    expect(isPlatformAdmin).not.toHaveBeenCalled()
  })
})
