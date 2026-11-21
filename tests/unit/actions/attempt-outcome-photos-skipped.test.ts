import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))

import { getAttemptOutcome } from '@/lib/actions/attempt-outcome'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'
import { skippedPhotosLine } from '@/lib/estimate/photos/skipped-photos-line'

function svcWith(metadata: Record<string, unknown> | null) {
  const rows = [
    {
      step: 'generate_estimate',
      status: 'succeeded',
      error_code: null,
      error_message: null,
      estimate_id: 'est-1',
      company_id: 'company-1',
      project_id: 'p1',
      created_at: '2026-11-21T00:00:00Z',
      metadata,
    },
  ]
  return {
    from: (table: string) => {
      if (table === 'pipeline_events') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: rows }) }) }) }
      }
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'est-1' } }) }) }) }),
      }
    },
  }
}

describe('getAttemptOutcome: photos that could not be read', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getClaims: async () => ({ data: { claims: { sub: 'u' } } }) },
    } as never)
    vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
  })

  it('carries photosSkipped from the succeeded row onto the completed outcome', async () => {
    vi.mocked(requireServiceClient).mockReturnValue(svcWith({ photosSkipped: 2 }) as never)
    expect(await getAttemptOutcome('a1')).toEqual({
      state: 'completed',
      estimateId: 'est-1',
      photosSkipped: 2,
    })
  })

  it('omits photosSkipped when nothing was skipped', async () => {
    vi.mocked(requireServiceClient).mockReturnValue(svcWith(null) as never)
    expect(await getAttemptOutcome('a1')).toEqual({ state: 'completed', estimateId: 'est-1' })
  })
})

describe('skippedPhotosLine', () => {
  const id = (s: string) => s
  it('uses the singular for one photo', () => {
    expect(skippedPhotosLine(id, 1)).toBe("1 photo couldn't be read, so the estimate doesn't use it.")
  })
  it('uses the plural with the count for several', () => {
    expect(skippedPhotosLine(id, 3)).toBe("3 photos couldn't be read, so the estimate doesn't use them.")
  })
})
