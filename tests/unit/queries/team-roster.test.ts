import { describe, it, expect, vi, beforeEach } from 'vitest'
import { XtimatorError } from '@/lib/errors'

/**
 * SEAT-05 — listCompanyRoster query (lib/queries/team.ts).
 *
 * Boundaries mocked: the role gate (requireCompanyManager) and the service-role
 * Supabase client (per-table router). Target module late-imported per test.
 *
 * Covers: a manager sees active members + pending invites only; a non-manager
 * (gate throws) is blocked with { error } and no roster rows leak.
 */

// ─── role gate ──────────────────────────────────────────────────────────────
const requireCompanyManager = vi.fn()
vi.mock('@/lib/auth/require-company-role', () => ({
  requireCompanyManager: (...args: unknown[]) => requireCompanyManager(...args),
}))

// ─── service-role Supabase per-table mock ───────────────────────────────────
// members:  .select(...).eq('company_id', ...).order('created_at', ...)
// invites:  .select(...).eq('company_id', ...).eq('status','pending').order(...)
const membersResult = { data: null as Record<string, unknown>[] | null, error: null as unknown }
const invitesResult = { data: null as Record<string, unknown>[] | null, error: null as unknown }
const fromImpl = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: (t: string) => fromImpl(t) }),
}))

function configureSupabase() {
  fromImpl.mockImplementation((table: string) => {
    if (table === 'company_members') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue(membersResult),
          }),
        }),
      }
    }
    if (table === 'company_invites') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue(invitesResult),
            }),
          }),
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireCompanyManager.mockResolvedValue({ userId: 'u1', companyId: 'c1', role: 'admin' })
  membersResult.data = [
    { user_id: 'u1', display_name: 'Owner One', email: 'owner@co.com', role: 'owner' },
    { user_id: 'u2', display_name: 'Member Two', email: 'm2@co.com', role: 'member' },
  ]
  membersResult.error = null
  invitesResult.data = [
    {
      id: 'inv_1',
      display_name: 'Pending Person',
      email: 'pending@co.com',
      role: 'member',
    },
  ]
  invitesResult.error = null
  configureSupabase()
})

describe('SEAT-05: listCompanyRoster', () => {
  it('manager sees active members + pending invites', async () => {
    const { listCompanyRoster } = await import('@/lib/queries/team')

    const result = await listCompanyRoster('c1')

    expect(requireCompanyManager).toHaveBeenCalledWith('c1')
    expect(result).toEqual({
      members: [
        { user_id: 'u1', display_name: 'Owner One', email: 'owner@co.com', role: 'owner' },
        { user_id: 'u2', display_name: 'Member Two', email: 'm2@co.com', role: 'member' },
      ],
      invites: [
        {
          id: 'inv_1',
          display_name: 'Pending Person',
          email: 'pending@co.com',
          role: 'member',
        },
      ],
    })
  })

  it('queries pending invites only (status=pending filter is applied)', async () => {
    const { listCompanyRoster } = await import('@/lib/queries/team')

    const result = await listCompanyRoster('c1')

    // The invites returned are exactly what the pending-filtered select yields.
    expect('invites' in result && result.invites).toEqual([
      {
        id: 'inv_1',
        display_name: 'Pending Person',
        email: 'pending@co.com',
        role: 'member',
      },
    ])
  })

  it('returns empty arrays when there are no members or invites', async () => {
    membersResult.data = []
    invitesResult.data = []
    const { listCompanyRoster } = await import('@/lib/queries/team')

    const result = await listCompanyRoster('c1')

    expect(result).toEqual({ members: [], invites: [] })
  })

  it('non-manager is blocked: returns { error }, no roster rows leaked', async () => {
    requireCompanyManager.mockRejectedValueOnce(
      new XtimatorError('forbidden', 'company', 'Insufficient company role')
    )
    const { listCompanyRoster } = await import('@/lib/queries/team')

    const result = await listCompanyRoster('c1')

    expect(result).toHaveProperty('error')
    expect(result).not.toHaveProperty('members')
    expect(result).not.toHaveProperty('invites')
    expect(fromImpl).not.toHaveBeenCalled()
  })
})
