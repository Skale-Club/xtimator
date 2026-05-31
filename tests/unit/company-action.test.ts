// tests/unit/company-action.test.ts
// TIER-04: verifies createOrUpdateCompany INSERT branch sets tier_trial_ends_at = now() + 14 days
// and the UPDATE branch does NOT reset tier_trial_ends_at.
//
// Phase 79 Plan 03: adds coverage for `mode: 'add'` (D-12 / D-13 / D-14 / D-15).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

vi.mock('@/lib/queries/active-company', () => ({
  ACTIVE_COMPANY_COOKIE: 'active_company_id',
  ACTIVE_COMPANY_COOKIE_OPTIONS: {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  },
  getActiveCompanyId: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireServiceClient } from '@/lib/supabase/service'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { cookies as nextCookies } from 'next/headers'

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

  // default cookie store mock for 'first' mode tests
  vi.mocked(nextCookies).mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
  } as never)

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

describe('createOrUpdateCompany — TIER-04 (mode: first regression)', () => {
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

// ============================================================
// Phase 79 Plan 03 — mode: 'add' behavior (D-12 / D-13 / D-14 / D-15)
// ============================================================

interface AddModeMockOpts {
  sourceTier?: string
  sourceTrialEndsAt?: string | null
  sourceCompanyId?: string | null
}

let capturedAddInsertRow: Record<string, unknown> | null = null
let capturedMemberInsertRow: Record<string, unknown> | null = null
let cookieSetSpy: ReturnType<typeof vi.fn>

function makeAddModeSupabaseMock(opts: AddModeMockOpts) {
  capturedAddInsertRow = null
  capturedMemberInsertRow = null
  cookieSetSpy = vi.fn()

  vi.mocked(nextCookies).mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
    set: cookieSetSpy,
  } as never)

  // Source-company lookup
  const sourceSingle = vi.fn().mockResolvedValue({
    data:
      opts.sourceTier !== undefined
        ? { tier: opts.sourceTier, tier_trial_ends_at: opts.sourceTrialEndsAt ?? null }
        : null,
  })
  const sourceEq = vi.fn().mockReturnValue({ single: sourceSingle })
  const sourceSelect = vi.fn().mockReturnValue({ eq: sourceEq })

  // New-company INSERT chain: .insert(row).select('id').single()
  const insertedSingle = vi.fn().mockResolvedValue({
    data: { id: 'new-company-id' },
    error: null,
  })
  const insertedSelect = vi.fn().mockReturnValue({ single: insertedSingle })
  const insertFn = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    capturedAddInsertRow = row
    return { select: insertedSelect }
  })

  const authedFrom = vi.fn().mockImplementation((table: string) => {
    if (table === 'companies') {
      return { select: sourceSelect, insert: insertFn }
    }
    return {}
  })

  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-abc' } } }),
    },
    from: authedFrom,
  } as never)

  vi.mocked(getActiveCompanyId).mockResolvedValue(opts.sourceCompanyId ?? null)

  const memberInsert = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    capturedMemberInsertRow = row
    return Promise.resolve({ error: null })
  })
  vi.mocked(requireServiceClient).mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'company_members') return { insert: memberInsert }
      return {}
    }),
  } as never)
}

describe('createOrUpdateCompany — mode: add (Phase 79 D-12/D-13/D-14/D-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('redirect')
    })
  })

  it('T3: add mode INSERTs even when user already owns a company (no UPDATE path)', async () => {
    makeAddModeSupabaseMock({
      sourceTier: 'pro',
      sourceTrialEndsAt: null,
      sourceCompanyId: 'existing-co',
    })
    const { createOrUpdateCompany } = await import('@/lib/actions/company')
    await createOrUpdateCompany({ companyName: 'Second Co' }, { mode: 'add' }).catch(() => {})
    expect(capturedAddInsertRow).not.toBeNull()
    expect(capturedAddInsertRow!.name).toBe('Second Co')
  })

  it('T4: add mode writes a company_members row with (claims.sub, new_company_id, owner)', async () => {
    makeAddModeSupabaseMock({
      sourceTier: 'pro',
      sourceCompanyId: 'existing-co',
    })
    const { createOrUpdateCompany } = await import('@/lib/actions/company')
    await createOrUpdateCompany({ companyName: 'Co' }, { mode: 'add' }).catch(() => {})
    expect(capturedMemberInsertRow).toEqual({
      user_id: 'user-abc',
      company_id: 'new-company-id',
      role: 'owner',
    })
  })

  it('T5: add mode sets the active_company_id cookie to the new company id', async () => {
    makeAddModeSupabaseMock({
      sourceTier: 'pro',
      sourceCompanyId: 'existing-co',
    })
    const { createOrUpdateCompany } = await import('@/lib/actions/company')
    await createOrUpdateCompany({ companyName: 'Co' }, { mode: 'add' }).catch(() => {})
    expect(cookieSetSpy).toHaveBeenCalledWith(
      'active_company_id',
      'new-company-id',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
    )
  })

  it('T6 (D-14): source tier=pro, trial=null → new company inherits tier=pro, trial=null', async () => {
    makeAddModeSupabaseMock({
      sourceTier: 'pro',
      sourceTrialEndsAt: null,
      sourceCompanyId: 'existing-co',
    })
    const { createOrUpdateCompany } = await import('@/lib/actions/company')
    await createOrUpdateCompany({ companyName: 'Co' }, { mode: 'add' }).catch(() => {})
    expect(capturedAddInsertRow!.tier).toBe('pro')
    expect(capturedAddInsertRow!.tier_trial_ends_at).toBeNull()
  })

  it('T7 (D-15): source tier=free, trial already past → new company born expired (same past date)', async () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    makeAddModeSupabaseMock({
      sourceTier: 'free',
      sourceTrialEndsAt: pastDate,
      sourceCompanyId: 'existing-co',
    })
    const { createOrUpdateCompany } = await import('@/lib/actions/company')
    await createOrUpdateCompany({ companyName: 'Co' }, { mode: 'add' }).catch(() => {})
    expect(capturedAddInsertRow!.tier).toBe('free')
    expect(capturedAddInsertRow!.tier_trial_ends_at).toBe(pastDate)
  })

  it('T8 (D-14): source tier=trial, trial future → new company inherits SAME future date (not fresh)', async () => {
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    makeAddModeSupabaseMock({
      sourceTier: 'trial',
      sourceTrialEndsAt: futureDate,
      sourceCompanyId: 'existing-co',
    })
    const { createOrUpdateCompany } = await import('@/lib/actions/company')
    await createOrUpdateCompany({ companyName: 'Co' }, { mode: 'add' }).catch(() => {})
    expect(capturedAddInsertRow!.tier).toBe('trial')
    expect(capturedAddInsertRow!.tier_trial_ends_at).toBe(futureDate)
  })

  it('T9 (T-79-03-01): user_id in INSERT comes from claims.sub, never from a parameter', async () => {
    makeAddModeSupabaseMock({
      sourceTier: 'pro',
      sourceCompanyId: 'existing-co',
    })
    const { createOrUpdateCompany } = await import('@/lib/actions/company')
    // @ts-expect-error — intentionally pass a malicious user_id that should be ignored
    await createOrUpdateCompany({ companyName: 'Co', user_id: 'attacker-uid' }, { mode: 'add' }).catch(() => {})
    expect(capturedAddInsertRow!.user_id).toBe('user-abc')
  })

  it('T10: degenerate path — user has no source company, falls back to fresh 14-day trial (safe-default)', async () => {
    const before = Date.now()
    makeAddModeSupabaseMock({
      sourceCompanyId: null,
    })
    const { createOrUpdateCompany } = await import('@/lib/actions/company')
    await createOrUpdateCompany({ companyName: 'Co' }, { mode: 'add' }).catch(() => {})
    expect(capturedAddInsertRow!.tier).toBeUndefined()
    const trialEndsAt = capturedAddInsertRow!.tier_trial_ends_at as string
    const trialMs = new Date(trialEndsAt).getTime()
    expect(trialMs).toBeGreaterThan(before + 13 * 24 * 60 * 60 * 1000)
    expect(trialMs).toBeLessThan(before + 15 * 24 * 60 * 60 * 1000)
  })
})

describe('createOrUpdateCompany — mode: first regression (Phase 79 D-12 backwards-compat)', () => {
  it('marker: existing TIER-04 tests cover mode: first regression', () => {
    expect(true).toBe(true)
  })
})
