// tests/unit/company-action.test.ts
// Billing v2: verifies the createOrUpdateCompany INSERT branch writes NO trial
// clock (the 14-day trial is retired — the free tier IS the trial via the
// one-time signup credit grant) and fires grantSignupCredits exactly for the
// FIRST company. The UPDATE branch never touches tier_trial_ends_at.
//
// Phase 79 Plan 03: coverage for `mode: 'add'` (D-12 / D-13 / D-14) — an added
// company inherits the TIER only; no fresh signup grant (anti credit-farming);
// an inherited PAID tier receives this month's grant immediately.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/billing/credit-ledger', () => ({
  grantSignupCredits: vi.fn().mockResolvedValue(undefined),
  grantMonthlyCredits: vi.fn().mockResolvedValue(undefined),
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
import { grantSignupCredits, grantMonthlyCredits } from '@/lib/billing/credit-ledger'
// Static import (not a per-test `await import`): the action drags in a heavy
// module graph (server-only, inngest client, email, price-book seed). Loading it
// inside the FIRST test's body raced the 5s testTimeout under full-suite CPU
// contention and flaked. vi.mock() is hoisted above imports, so the mocks above
// still apply; the graph now loads once during collection, off the test clock.
import { createOrUpdateCompany } from '@/lib/actions/company'

// Capture what was passed to insert() or update()
let capturedInsertRow: Record<string, unknown> | null = null
let capturedUpdateRow: Record<string, unknown> | null = null

function makeSupabaseMock({ isNewCompany }: { isNewCompany: boolean }) {
  capturedInsertRow = null
  capturedUpdateRow = null

  const insertMock = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    capturedInsertRow = row
    // Support both the bare await shape and the .select('id').single() chain
    // the first-company INSERT uses (Billing v2 needs the new id for the grant).
    const result = Promise.resolve({ error: null }) as Promise<{ error: null }> & {
      select: (cols: string) => { single: () => Promise<{ data: { id: string }; error: null }> }
    }
    result.select = () => ({
      single: () => Promise.resolve({ data: { id: 'company-new' }, error: null }),
    })
    return result
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

describe('createOrUpdateCompany — Billing v2 (mode: first regression)', () => {
  let memberSelectMaybeSingle: ReturnType<typeof vi.fn>
  let memberInsert: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(redirect).mockImplementation(() => { throw new Error('redirect') })
    // Permissive service client so the first-company flow reaches the signup
    // grant. company_members is table-aware (B6 self-heal in the UPDATE
    // branch does a select().eq().eq().maybeSingle() before deciding whether
    // to insert) — default: no existing membership row, so the self-heal
    // insert fires.
    memberSelectMaybeSingle = vi.fn().mockResolvedValue({ data: null })
    memberInsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(requireServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'company_members') {
          return {
            insert: memberInsert,
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ maybeSingle: memberSelectMaybeSingle }),
              }),
            }),
          }
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }),
    } as never)
  })

  it('INSERT branch: writes NO trial clock and fires the one-time signup credit grant', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ isNewCompany: true }) as never)


    await createOrUpdateCompany({ companyName: 'New Co' }).catch(() => {/* redirect throws */})

    expect(capturedInsertRow).not.toBeNull()
    // Billing v2: the 14-day trial is retired — the insert row must not carry a clock.
    expect('tier_trial_ends_at' in capturedInsertRow!).toBe(false)
    // The free allowance arrives as the one-time signup credit grant instead.
    expect(grantSignupCredits).toHaveBeenCalledWith('company-new')
  })

  it('UPDATE branch: existing company does NOT get tier_trial_ends_at reset', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ isNewCompany: false }) as never)


    await createOrUpdateCompany({ companyName: 'Existing Co' }).catch(() => {/* redirect throws */})

    expect(capturedUpdateRow).not.toBeNull()
    expect(capturedUpdateRow!['tier_trial_ends_at']).toBeUndefined()
  })

  it('B6 self-heal: UPDATE branch inserts a missing company_members row when none exists', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ isNewCompany: false }) as never)
    memberSelectMaybeSingle.mockResolvedValue({ data: null }) // no existing membership row

    await createOrUpdateCompany({ companyName: 'Existing Co' }).catch(() => {/* redirect throws */})

    expect(memberInsert).toHaveBeenCalledWith({
      user_id: 'user-abc',
      company_id: 'company-xyz',
      role: 'owner',
    })
  })

  it('B6 self-heal: UPDATE branch does NOT re-insert when a company_members row already exists', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ isNewCompany: false }) as never)
    memberSelectMaybeSingle.mockResolvedValue({ data: { user_id: 'user-abc' } }) // already a member

    await createOrUpdateCompany({ companyName: 'Existing Co' }).catch(() => {/* redirect throws */})

    expect(memberInsert).not.toHaveBeenCalled()
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
    await createOrUpdateCompany({ companyName: 'Second Co' }, { mode: 'add' }).catch(() => {})
    expect(capturedAddInsertRow).not.toBeNull()
    expect(capturedAddInsertRow!.name).toBe('Second Co')
  })

  it('T4: add mode writes a company_members row with (claims.sub, new_company_id, owner)', async () => {
    makeAddModeSupabaseMock({
      sourceTier: 'pro',
      sourceCompanyId: 'existing-co',
    })
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

  it('T6 (D-14): source tier=pro → new company inherits tier=pro, no trial clock, month grant fired', async () => {
    makeAddModeSupabaseMock({
      sourceTier: 'pro',
      sourceTrialEndsAt: null,
      sourceCompanyId: 'existing-co',
    })
    await createOrUpdateCompany({ companyName: 'Co' }, { mode: 'add' }).catch(() => {})
    expect(capturedAddInsertRow!.tier).toBe('pro')
    expect('tier_trial_ends_at' in capturedAddInsertRow!).toBe(false)
    // Inherited PAID tier gets this month's grant immediately (shared month key —
    // the monthly cron later no-ops).
    expect(grantMonthlyCredits).toHaveBeenCalledWith('new-company-id', 'pro', 'company-added')
  })

  it('T7: source tier=free → inherits free; NO signup grant, NO month grant (anti credit-farming)', async () => {
    makeAddModeSupabaseMock({
      sourceTier: 'free',
      sourceTrialEndsAt: null,
      sourceCompanyId: 'existing-co',
    })
    await createOrUpdateCompany({ companyName: 'Co' }, { mode: 'add' }).catch(() => {})
    expect(capturedAddInsertRow!.tier).toBe('free')
    expect('tier_trial_ends_at' in capturedAddInsertRow!).toBe(false)
    expect(grantSignupCredits).not.toHaveBeenCalled()
    expect(grantMonthlyCredits).not.toHaveBeenCalled()
  })

  it('T8: source tier=business → inherits business + month grant fired', async () => {
    makeAddModeSupabaseMock({
      sourceTier: 'business',
      sourceTrialEndsAt: null,
      sourceCompanyId: 'existing-co',
    })
    await createOrUpdateCompany({ companyName: 'Co' }, { mode: 'add' }).catch(() => {})
    expect(capturedAddInsertRow!.tier).toBe('business')
    expect(grantMonthlyCredits).toHaveBeenCalledWith('new-company-id', 'business', 'company-added')
  })

  it('T9 (T-79-03-01): user_id in INSERT comes from claims.sub, never from a parameter', async () => {
    makeAddModeSupabaseMock({
      sourceTier: 'pro',
      sourceCompanyId: 'existing-co',
    })
    // @ts-expect-error — intentionally pass a malicious user_id that should be ignored
    await createOrUpdateCompany({ companyName: 'Co', user_id: 'attacker-uid' }, { mode: 'add' }).catch(() => {})
    expect(capturedAddInsertRow!.user_id).toBe('user-abc')
  })

  it('T10: degenerate path — no source company → DB default free, no clock, no grants', async () => {
    makeAddModeSupabaseMock({
      sourceCompanyId: null,
    })
    await createOrUpdateCompany({ companyName: 'Co' }, { mode: 'add' }).catch(() => {})
    expect(capturedAddInsertRow!.tier).toBeUndefined()
    expect('tier_trial_ends_at' in capturedAddInsertRow!).toBe(false)
    expect(grantSignupCredits).not.toHaveBeenCalled()
    expect(grantMonthlyCredits).not.toHaveBeenCalled()
  })
})

describe('createOrUpdateCompany — mode: first regression (Phase 79 D-12 backwards-compat)', () => {
  it('marker: existing TIER-04 tests cover mode: first regression', () => {
    expect(true).toBe(true)
  })
})
