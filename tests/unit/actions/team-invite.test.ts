import { describe, it, expect, vi, beforeEach } from 'vitest'

// lib/actions/team loads next/headers and server-action internals; the lazy
// import inside each test can exceed 5s under fork-pool contention.
vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 })

/**
 * SEAT-03 — inviteMember + revokeInvite server actions (lib/actions/team.ts).
 *
 * Boundaries mocked: the single role gate (requireCompanyManager), the invite
 * email (sendInviteEmail), the service-role Supabase client (per-table router),
 * and next/cache revalidatePath. The target module is imported late inside each
 * test (so each test sees its configured mocks) per the invoice.test.ts idiom.
 *
 * Covers: happy path, token-never-returned, the 4 inviteMember reject paths +
 * already-active-member + duplicate-pending, and the 3 revokeInvite cases.
 */

// ─── role gate ──────────────────────────────────────────────────────────────
const requireCompanyManager = vi.fn()
vi.mock('@/lib/auth/require-company-role', () => ({
  requireCompanyManager: (...args: unknown[]) => requireCompanyManager(...args),
}))

// ─── invite email ───────────────────────────────────────────────────────────
const sendInviteEmail = vi.fn()
vi.mock('@/lib/email/invite-emails', () => ({
  sendInviteEmail: (...args: unknown[]) => sendInviteEmail(...args),
}))

// ─── next/cache ─────────────────────────────────────────────────────────────
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ─── demo guard (Phase 180) ─────────────────────────────────────────────────
// inviteMember/revokeInvite call assertWritable() ambiently; the real ambient
// path resolves cookies() + getActiveCompanyId() independently of this file's
// own mocks. Mocked directly so this suite stays isolated to SEAT-03, not
// demo-guard internals (covered separately in tests/unit/demo/*).
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn(async () => null),
  assertCompanyWritable: vi.fn(async () => null),
}))

// ─── service-role Supabase per-table mock ───────────────────────────────────
const membersSelectResult = { data: null as Record<string, unknown>[] | null, error: null as unknown }
const pendingInviteResult = { data: null as Record<string, unknown>[] | null, error: null as unknown }
const inviteLookupResult = { data: null as Record<string, unknown> | null, error: null as unknown }
const companySelectResult = { data: { name: 'Acme Co' } as Record<string, unknown> | null, error: null as unknown }

const invitesInsert = vi.fn()
const invitesUpdate = vi.fn()
const fromImpl = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: (t: string) => fromImpl(t) }),
}))

function configureSupabase() {
  invitesInsert.mockResolvedValue({ error: null })
  invitesUpdate.mockResolvedValue({ error: null })

  fromImpl.mockImplementation((table: string) => {
    if (table === 'company_members') {
      // .select(...).eq('company_id', ...) → resolves member rows (active-member guard)
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(membersSelectResult),
        }),
      }
    }
    if (table === 'company_invites') {
      return {
        // duplicate-pending guard: .select(...).eq().eq().eq() → resolves rows
        // invite lookup (revoke): .select(...).eq('id', ...).maybeSingle()
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue(pendingInviteResult),
            }),
            maybeSingle: vi.fn().mockResolvedValue(inviteLookupResult),
          }),
        }),
        insert: (...args: unknown[]) => invitesInsert(...args),
        // update(...).eq('id', ...).eq('status', 'pending')
        update: (...args: unknown[]) => {
          invitesUpdate(...args)
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        },
      }
    }
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(companySelectResult),
          }),
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireCompanyManager.mockResolvedValue({ userId: 'u1', companyId: 'c1', role: 'owner' })
  sendInviteEmail.mockResolvedValue(undefined)
  membersSelectResult.data = []
  membersSelectResult.error = null
  pendingInviteResult.data = []
  pendingInviteResult.error = null
  inviteLookupResult.data = null
  inviteLookupResult.error = null
  companySelectResult.data = { name: 'Acme Co' }
  companySelectResult.error = null
  configureSupabase()
})

describe('SEAT-03: inviteMember', () => {
  it('happy path: inserts a pending invite, emails the token, returns success without the token', async () => {
    const { inviteMember } = await import('@/lib/actions/team')

    const result = await inviteMember('c1', 'New Person', 'New@Person.com', 'member')

    expect(invitesInsert).toHaveBeenCalledTimes(1)
    const inserted = invitesInsert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.company_id).toBe('c1')
    expect(inserted.display_name).toBe('New Person')
    expect(inserted.email).toBe('new@person.com')
    expect(inserted.role).toBe('member')
    expect(inserted.status).toBe('pending')
    expect(inserted.invited_by).toBe('u1')
    expect(typeof inserted.token).toBe('string')
    expect((inserted.token as string).length).toBeGreaterThan(0)
    expect(new Date(inserted.expires_at as string).getTime()).toBeGreaterThan(Date.now())

    expect(sendInviteEmail).toHaveBeenCalledTimes(1)
    const emailCtx = sendInviteEmail.mock.calls[0][0] as Record<string, unknown>
    expect(emailCtx.toEmail).toBe('new@person.com')
    expect(emailCtx.role).toBe('member')
    expect(emailCtx.token).toBe(inserted.token)

    expect(result).toEqual({ success: true })
  })

  it('never returns the raw token to the client', async () => {
    const { inviteMember } = await import('@/lib/actions/team')

    const result = await inviteMember('c1', 'A Person', 'a@b.co', 'member')

    expect(result).toEqual({ success: true })
    expect(Object.keys(result as object)).not.toContain('token')
    const token = (invitesInsert.mock.calls[0][0] as Record<string, unknown>).token as string
    expect(JSON.stringify(result)).not.toContain(token)
  })

  it('rejects a non-manager: no insert, no email', async () => {
    requireCompanyManager.mockRejectedValueOnce(new Error('forbidden'))
    const { inviteMember } = await import('@/lib/actions/team')

    const result = await inviteMember('c1', 'A Person', 'a@b.co', 'member')

    expect(result).toHaveProperty('error')
    expect(invitesInsert).not.toHaveBeenCalled()
    expect(sendInviteEmail).not.toHaveBeenCalled()
  })

  it('rejects an invalid email before any DB write', async () => {
    const { inviteMember } = await import('@/lib/actions/team')

    const result = await inviteMember('c1', 'A Person', 'not-an-email', 'member')

    expect(result).toHaveProperty('error')
    expect(invitesInsert).not.toHaveBeenCalled()
    expect(sendInviteEmail).not.toHaveBeenCalled()
  })

  it("rejects role 'owner'", async () => {
    const { inviteMember } = await import('@/lib/actions/team')

    const result = await inviteMember('c1', 'A Person', 'a@b.co', 'owner' as 'member')

    expect(result).toHaveProperty('error')
    expect(invitesInsert).not.toHaveBeenCalled()
  })

  it('rejects an already-active member', async () => {
    membersSelectResult.data = [{ email: 'a@b.co' }]
    const { inviteMember } = await import('@/lib/actions/team')

    const result = await inviteMember('c1', 'A Person', 'A@b.co', 'member')

    expect(result).toHaveProperty('error')
    expect(invitesInsert).not.toHaveBeenCalled()
    expect(sendInviteEmail).not.toHaveBeenCalled()
  })

  it('rejects a duplicate pending invite', async () => {
    pendingInviteResult.data = [{ id: 'inv_existing' }]
    const { inviteMember } = await import('@/lib/actions/team')

    const result = await inviteMember('c1', 'A Person', 'a@b.co', 'member')

    expect(result).toHaveProperty('error')
    expect(invitesInsert).not.toHaveBeenCalled()
    expect(sendInviteEmail).not.toHaveBeenCalled()
  })

  it('rejects an empty display name before any DB write', async () => {
    const { inviteMember } = await import('@/lib/actions/team')

    const result = await inviteMember('c1', '   ', 'a@b.co', 'member')

    expect(result).toHaveProperty('error')
    expect(invitesInsert).not.toHaveBeenCalled()
    expect(sendInviteEmail).not.toHaveBeenCalled()
  })
})

describe('SEAT-03: revokeInvite', () => {
  it('happy path: flips a pending invite to revoked', async () => {
    inviteLookupResult.data = { company_id: 'c1', status: 'pending' }
    const { revokeInvite } = await import('@/lib/actions/team')

    const result = await revokeInvite('inv_1')

    expect(requireCompanyManager).toHaveBeenCalledWith('c1')
    expect(invitesUpdate).toHaveBeenCalledTimes(1)
    expect((invitesUpdate.mock.calls[0][0] as Record<string, unknown>).status).toBe('revoked')
    expect(result).toEqual({ success: true })
  })

  it('no-ops on a non-pending invite', async () => {
    inviteLookupResult.data = { company_id: 'c1', status: 'accepted' }
    const { revokeInvite } = await import('@/lib/actions/team')

    const result = await revokeInvite('inv_1')

    expect(result).toHaveProperty('error')
    expect(invitesUpdate).not.toHaveBeenCalled()
  })

  it('blocks a non-manager', async () => {
    inviteLookupResult.data = { company_id: 'c1', status: 'pending' }
    requireCompanyManager.mockRejectedValueOnce(new Error('forbidden'))
    const { revokeInvite } = await import('@/lib/actions/team')

    const result = await revokeInvite('inv_1')

    expect(result).toHaveProperty('error')
    expect(invitesUpdate).not.toHaveBeenCalled()
  })
})
