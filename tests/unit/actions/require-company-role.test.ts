import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * SEAT-02 — behavioral matrix proving the single server-side role-authority gate.
 *
 * The role is read ONLY from company_members via the RLS-bound server client
 * (mocked here exactly like the action tests). Every cell of the locked matrix is
 * asserted:
 *   owner   → passes owner-only gate
 *   admin   → passes manager gate, FAILS owner-only gate
 *   member  → FAILS manager gate
 *   none    → non-member denied (no membership row)
 *   ()      → unauthenticated denied (no auth claim sub)
 * plus a proof that the role came from the DB (`from('company_members')` called),
 * never from an argument.
 */

const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}))

import {
  requireCompanyRole,
  requireCompanyManager,
  requireCompanyOwner,
} from '@/lib/auth/require-company-role'

/**
 * Build a fake RLS-bound client whose getClaims() yields `sub` (or null when
 * `authenticated: false`) and whose company_members query resolves the given
 * role (or null membership when `role` is omitted). Returns the client plus the
 * `from` spy so tests can assert the server-side read.
 */
function mockSupabase({
  role,
  authenticated = true,
}: {
  role?: 'owner' | 'admin' | 'member'
  authenticated?: boolean
}) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: role ? { role } : null, error: null })
  const eqCompany = vi.fn().mockReturnValue({ maybeSingle })
  const eqUser = vi.fn().mockReturnValue({ eq: eqCompany })
  const select = vi.fn().mockReturnValue({ eq: eqUser })
  const from = vi.fn().mockReturnValue({ select })

  const client = {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: authenticated ? { sub: 'u_1' } : null },
      }),
    },
    from,
  }

  createClient.mockResolvedValue(client)
  return { client, from }
}

describe('SEAT-02: requireCompanyRole role matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('owner passes the owner-only gate', async () => {
    mockSupabase({ role: 'owner' })
    const ctx = await requireCompanyOwner('co_1')
    expect(ctx.role).toBe('owner')
    expect(ctx.userId).toBe('u_1')
    expect(ctx.companyId).toBe('co_1')
  })

  it('admin passes the manager gate (owner|admin)', async () => {
    mockSupabase({ role: 'admin' })
    const ctx = await requireCompanyManager('co_1')
    expect(ctx.role).toBe('admin')
  })

  it('admin FAILS the owner-only gate', async () => {
    mockSupabase({ role: 'admin' })
    await expect(requireCompanyOwner('co_1')).rejects.toThrow()
  })

  it('member FAILS the manager gate', async () => {
    mockSupabase({ role: 'member' })
    await expect(requireCompanyManager('co_1')).rejects.toThrow()
  })

  it('non-member (no membership row) is denied', async () => {
    mockSupabase({}) // role omitted → membership === null
    await expect(requireCompanyManager('co_1')).rejects.toThrow()
  })

  it('unauthenticated (no auth claim sub) is denied', async () => {
    mockSupabase({ authenticated: false })
    await expect(
      requireCompanyRole('co_1', ['owner', 'admin'])
    ).rejects.toThrow()
  })

  it('reads the role from company_members server-side (not from an argument)', async () => {
    const { from } = mockSupabase({ role: 'owner' })
    await requireCompanyOwner('co_1')
    expect(from).toHaveBeenCalledWith('company_members')
  })
})
