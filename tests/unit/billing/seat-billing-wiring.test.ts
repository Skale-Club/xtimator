import { describe, it, expect, vi, beforeEach } from 'vitest'

// lib/actions/team and lib/actions/invite-accept load next/headers and
// server-action internals; lazy imports inside tests can exceed 5s under
// fork-pool contention.
vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 })

/**
 * SEAT-07 (wiring) — the three membership mutations invoke the never-throw
 * syncSeatBilling(companyId) as a guarded side-effect of a SUCCESSFUL change:
 *   - acceptInvite(token)         → syncSeatBilling(invite.company_id)
 *   - removeMember(companyId, id) → syncSeatBilling(companyId)
 *   - changeMemberRole(...)       → syncSeatBilling(companyId)
 *
 * Contract proven here:
 *   1. On success, each action fires syncSeatBilling once with the right company id.
 *   2. A FAILED membership op (missing target, etc.) does NOT call syncSeatBilling.
 *   3. When syncSeatBilling REJECTS, the action STILL returns { success: true }
 *      — the membership op is never rolled back / never failed by a billing hiccup.
 *
 * syncSeatBilling is fully mocked (vi.fn) — NO billing-config, NO Stripe, NO DB,
 * NO secrets. The membership boundaries (service client, auth claims,
 * requireCompanyManager, switchActiveCompany, next/cache) reuse the posture from
 * the existing invite-accept / team-manage suites. Modules are late-imported per
 * test so each sees its configured mocks.
 */

// ─── seat-billing (under-wiring) mock ───────────────────────────────────────
const syncSeatBilling = vi.fn<(companyId: string) => Promise<void>>()
vi.mock('@/lib/billing/seat-billing', () => ({
  syncSeatBilling: (...args: [string]) => syncSeatBilling(...args),
}))

// ─── request-scoped auth claims (accepting user, acceptInvite) ──────────────
const getClaims = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: (...args: unknown[]) => getClaims(...args) },
  }),
}))

// ─── active-company switch (acceptInvite) ───────────────────────────────────
const switchActiveCompany = vi.fn()
vi.mock('@/lib/actions/active-company', () => ({
  switchActiveCompany: (...args: unknown[]) => switchActiveCompany(...args),
}))

// ─── role gate (team.ts) ────────────────────────────────────────────────────
const requireCompanyManager = vi.fn()
vi.mock('@/lib/auth/require-company-role', () => ({
  requireCompanyManager: (...args: unknown[]) => requireCompanyManager(...args),
}))

// ─── next/cache ─────────────────────────────────────────────────────────────
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}))

// ─── service-role Supabase per-table mock ───────────────────────────────────
// acceptInvite path: invite lookup (maybeSingle), guarded flip (update→eq→eq→select),
// member upsert. team.ts path: target-role lookup (select→eq→eq→maybeSingle),
// delete (delete→eq→eq), update (update→eq→eq).
const inviteLookupResult = { data: null as Record<string, unknown> | null, error: null as unknown }
const flipResult = { data: null as Record<string, unknown>[] | null, error: null as unknown }
const memberUpsertResult = { error: null as unknown }
const targetLookupResult = { data: null as Record<string, unknown> | null, error: null as unknown }

const membersUpsert = vi.fn()
const membersDelete = vi.fn()
const membersUpdate = vi.fn()
const invitesUpdate = vi.fn()
const fromImpl = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: (t: string) => fromImpl(t) }),
}))

function configureSupabase() {
  // acceptInvite — guarded flip chain
  invitesUpdate.mockImplementation(() => ({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue(flipResult),
      }),
    }),
  }))
  membersUpsert.mockImplementation(() => Promise.resolve(memberUpsertResult))

  // team.ts — delete / update chains
  membersDelete.mockReturnValue({
    eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  })
  membersUpdate.mockReturnValue({
    eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  })

  fromImpl.mockImplementation((table: string) => {
    if (table === 'company_invites') {
      return {
        // invite lookup: .select(...).eq('token', ...).maybeSingle()
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(inviteLookupResult),
          }),
        }),
        update: (...args: unknown[]) => invitesUpdate(...args),
      }
    }
    if (table === 'company_members') {
      return {
        // role lookup: .select('role').eq().eq().maybeSingle()
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(targetLookupResult),
            }),
          }),
        }),
        upsert: (...args: unknown[]) => membersUpsert(...args),
        delete: (...args: unknown[]) => membersDelete(...args),
        update: (...args: unknown[]) => membersUpdate(...args),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

const FUTURE = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()

function pendingInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv_1',
    company_id: 'c1',
    email: 'invitee@example.com',
    role: 'member',
    status: 'pending',
    expires_at: FUTURE(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // syncSeatBilling resolves by default; per-test reject for the tolerance cases.
  syncSeatBilling.mockResolvedValue(undefined)
  // acceptInvite happy posture
  getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', email: 'invitee@example.com' } } })
  switchActiveCompany.mockResolvedValue({ ok: true })
  inviteLookupResult.data = pendingInvite()
  inviteLookupResult.error = null
  flipResult.data = [{ id: 'inv_1' }] // won the race
  flipResult.error = null
  memberUpsertResult.error = null
  // team.ts happy posture
  requireCompanyManager.mockResolvedValue({ userId: 'u1', companyId: 'c1', role: 'admin' })
  targetLookupResult.data = { role: 'member' }
  targetLookupResult.error = null
  configureSupabase()
})

// =============================================================================
// acceptInvite → syncSeatBilling(invite.company_id)
// =============================================================================
describe('SEAT-07 wiring: acceptInvite', () => {
  it('on success → calls syncSeatBilling once with the invite company_id', async () => {
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_valid')

    expect(result).toEqual({ success: true })
    expect(syncSeatBilling).toHaveBeenCalledTimes(1)
    expect(syncSeatBilling).toHaveBeenCalledWith('c1')
  })

  it('when syncSeatBilling REJECTS → still returns { success: true } (join not rolled back)', async () => {
    syncSeatBilling.mockRejectedValueOnce(new Error('seat sync exploded'))
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_valid')

    expect(result).toEqual({ success: true })
    expect(syncSeatBilling).toHaveBeenCalledTimes(1)
  })

  it('FAILED join (lost single-use race) → does NOT call syncSeatBilling', async () => {
    flipResult.data = [] // another accept won → no membership written
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_valid')

    expect(result).toHaveProperty('error')
    expect(syncSeatBilling).not.toHaveBeenCalled()
  })
})

// =============================================================================
// removeMember → syncSeatBilling(companyId)
// =============================================================================
describe('SEAT-07 wiring: removeMember', () => {
  it('on success → calls syncSeatBilling once with companyId', async () => {
    const { removeMember } = await import('@/lib/actions/team')

    const result = await removeMember('c1', 'target-user')

    expect(result).toEqual({ success: true })
    expect(syncSeatBilling).toHaveBeenCalledTimes(1)
    expect(syncSeatBilling).toHaveBeenCalledWith('c1')
  })

  it('when syncSeatBilling REJECTS → still returns { success: true } (removal not rolled back)', async () => {
    syncSeatBilling.mockRejectedValueOnce(new Error('seat sync exploded'))
    const { removeMember } = await import('@/lib/actions/team')

    const result = await removeMember('c1', 'target-user')

    expect(result).toEqual({ success: true })
    expect(syncSeatBilling).toHaveBeenCalledTimes(1)
  })

  it('FAILED op (missing target) → does NOT call syncSeatBilling', async () => {
    targetLookupResult.data = null
    const { removeMember } = await import('@/lib/actions/team')

    const result = await removeMember('c1', 'ghost')

    expect(result).toEqual({ error: 'Member not found.' })
    expect(syncSeatBilling).not.toHaveBeenCalled()
  })

  it('FAILED op (last-owner guard) → does NOT call syncSeatBilling', async () => {
    targetLookupResult.data = { role: 'owner' }
    const { removeMember } = await import('@/lib/actions/team')

    const result = await removeMember('c1', 'owner-user')

    expect(result).toHaveProperty('error')
    expect(syncSeatBilling).not.toHaveBeenCalled()
  })
})

// =============================================================================
// changeMemberRole → syncSeatBilling(companyId)
// =============================================================================
describe('SEAT-07 wiring: changeMemberRole', () => {
  it('on success → calls syncSeatBilling once with companyId', async () => {
    targetLookupResult.data = { role: 'admin' }
    const { changeMemberRole } = await import('@/lib/actions/team')

    const result = await changeMemberRole('c1', 'target-user', 'member')

    expect(result).toEqual({ success: true })
    expect(syncSeatBilling).toHaveBeenCalledTimes(1)
    expect(syncSeatBilling).toHaveBeenCalledWith('c1')
  })

  it('when syncSeatBilling REJECTS → still returns { success: true } (role change not rolled back)', async () => {
    syncSeatBilling.mockRejectedValueOnce(new Error('seat sync exploded'))
    const { changeMemberRole } = await import('@/lib/actions/team')

    const result = await changeMemberRole('c1', 'target-user', 'member')

    expect(result).toEqual({ success: true })
    expect(syncSeatBilling).toHaveBeenCalledTimes(1)
  })

  it('FAILED op (invalid role) → does NOT call syncSeatBilling', async () => {
    const { changeMemberRole } = await import('@/lib/actions/team')

    const result = await changeMemberRole('c1', 'target-user', 'owner' as 'admin')

    expect(result).toHaveProperty('error')
    expect(syncSeatBilling).not.toHaveBeenCalled()
  })
})
