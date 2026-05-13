// tests/unit/company-action.test.ts
// TIER-04: verifies createOrUpdateCompany INSERT branch sets tier_trial_ends_at = now() + 14 days
// and the UPDATE branch does NOT reset tier_trial_ends_at.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Capture what was passed to insert() or update()
let capturedInsertRow: Record<string, unknown> | null = null
let capturedUpdateRow: Record<string, unknown> | null = null

function makeSupabaseMock({ isNewCompany }: { isNewCompany: boolean }) {
  capturedInsertRow = null
  capturedUpdateRow = null

  const insertMock = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    capturedInsertRow = row
    return Promise.resolve({ error: null })
  })

  const updateMock = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    capturedUpdateRow = row
    return {
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
  })

  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: 'user-abc' } },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: isNewCompany ? null : { id: 'company-xyz' },
              }),
            }),
          }),
          insert: insertMock,
          update: updateMock,
        }
      }
      return {}
    }),
  }
}

describe('createOrUpdateCompany — TIER-04', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(redirect).mockImplementation(() => { throw new Error('redirect') })
  })

  it('INSERT branch: new company gets tier_trial_ends_at ~14 days from now', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ isNewCompany: true }) as never)

    const { createOrUpdateCompany } = await import('@/lib/actions/company')
    const before = Date.now()

    await createOrUpdateCompany({ companyName: 'New Co' }).catch(() => {/* redirect throws */})

    expect(capturedInsertRow).not.toBeNull()
    const trialEndsAt = capturedInsertRow!['tier_trial_ends_at'] as string
    expect(trialEndsAt).toBeDefined()
    expect(typeof trialEndsAt).toBe('string')

    const trialDate = new Date(trialEndsAt).getTime()
    const expectedMin = before + 13 * 24 * 60 * 60 * 1000 // ~13 days
    const expectedMax = before + 15 * 24 * 60 * 60 * 1000 // ~15 days
    expect(trialDate).toBeGreaterThan(expectedMin)
    expect(trialDate).toBeLessThan(expectedMax)
  })

  it('UPDATE branch: existing company does NOT get tier_trial_ends_at reset', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ isNewCompany: false }) as never)

    const { createOrUpdateCompany } = await import('@/lib/actions/company')

    await createOrUpdateCompany({ companyName: 'Existing Co' }).catch(() => {/* redirect throws */})

    expect(capturedUpdateRow).not.toBeNull()
    expect(capturedUpdateRow!['tier_trial_ends_at']).toBeUndefined()
  })
})
