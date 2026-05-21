import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock createClient from @/lib/supabase/server — this is what getAuthContext calls internally.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { logTourEvent } from '@/lib/actions/tour'

function makeMockSupabase(overrides?: {
  claims?: object | null
  company?: object | null
  insertError?: object | null
}) {
  const insertMock = vi.fn().mockResolvedValue({ error: overrides?.insertError ?? null })
  const fromMock = vi.fn().mockReturnValue({
    insert: insertMock,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: overrides?.company !== undefined ? overrides.company : { id: 'company-uuid' },
    }),
  })
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: overrides?.claims !== undefined ? overrides.claims : { sub: 'user-uuid' } },
      }),
    },
    from: fromMock,
    _insertMock: insertMock,
    _fromMock: fromMock,
  }
}

describe('logTourEvent', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('inserts tour_started with correct shape when auth succeeds', async () => {
    const mockSupabase = makeMockSupabase()
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)
    await logTourEvent('tour_started')
    expect(mockSupabase._fromMock).toHaveBeenCalledWith('tour_events')
    expect(mockSupabase._insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'tour_started', company_id: 'company-uuid' })
    )
  })

  it('includes metadata in the insert for tour_skipped', async () => {
    const mockSupabase = makeMockSupabase()
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)
    await logTourEvent('tour_skipped', { step_index: 2 })
    expect(mockSupabase._insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { step_index: 2 } })
    )
  })

  it('swallows error when auth context returns error (no company)', async () => {
    const mockSupabase = makeMockSupabase({ company: null })
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)
    await expect(logTourEvent('tour_started')).resolves.toBeUndefined()
  })

  it('swallows error when claims are missing', async () => {
    const mockSupabase = makeMockSupabase({ claims: null })
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)
    await expect(logTourEvent('tour_started')).resolves.toBeUndefined()
  })
})
