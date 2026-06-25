import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * SEAT-04 — acceptInvite(token) server action (lib/actions/invite-accept.ts).
 *
 * Token authority via the SERVICE client (the accepting user is NOT yet a member,
 * so RLS owner/admin policies do not cover them — requireCompanyRole is NOT used).
 *
 * Boundaries mocked: the service-role Supabase client (per-table router), the
 * request-scoped client's auth.getClaims() (the accepting user's id + email),
 * switchActiveCompany, and next/cache. The target module is imported late inside
 * each test (so each test sees its configured mocks) per the team-invite.test.ts
 * idiom.
 *
 * Covers: happy path, expired, revoked, already-accepted, single-use lost race
 * (guarded flip returns 0 rows), unknown token, email mismatch, unauthenticated,
 * idempotent membership (ON CONFLICT), and "never logs the token".
 */

// ─── request-scoped auth claims (accepting user) ────────────────────────────
const getClaims = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: (...args: unknown[]) => getClaims(...args) },
  }),
}))

// ─── active-company switch ──────────────────────────────────────────────────
const switchActiveCompany = vi.fn()
vi.mock('@/lib/actions/active-company', () => ({
  switchActiveCompany: (...args: unknown[]) => switchActiveCompany(...args),
}))

// ─── next/cache ─────────────────────────────────────────────────────────────
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

// ─── service-role Supabase per-table mock ───────────────────────────────────
// invite lookup: .select(...).eq('token', ...).maybeSingle()
const inviteLookupResult = { data: null as Record<string, unknown> | null, error: null as unknown }
// guarded flip: .update(...).eq('id',...).eq('status','pending').select('id') → { data: rows }
const flipResult = { data: null as Record<string, unknown>[] | null, error: null as unknown }
// member upsert: .upsert(...) → { error }
const memberUpsertResult = { error: null as unknown }

const invitesUpdate = vi.fn()
const membersUpsert = vi.fn()
const fromImpl = vi.fn()

// captured call payloads (typed, so tsc stays happy)
let updatePayload: Record<string, unknown> | undefined
let upsertPayload: Record<string, unknown> | undefined
let upsertOptions: Record<string, unknown> | undefined

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: (t: string) => fromImpl(t) }),
}))

function configureSupabase() {
  invitesUpdate.mockImplementation((...args: unknown[]) => {
    // capture the update payload then return the chainable guarded flip
    updatePayload = args[0] as Record<string, unknown>
    return {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue(flipResult),
        }),
      }),
    }
  })
  membersUpsert.mockImplementation((...args: unknown[]) => {
    upsertPayload = args[0] as Record<string, unknown>
    upsertOptions = args[1] as Record<string, unknown>
    return Promise.resolve(memberUpsertResult)
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
        // guarded flip
        update: (...args: unknown[]) => invitesUpdate(...args),
      }
    }
    if (table === 'company_members') {
      return {
        upsert: (...args: unknown[]) => membersUpsert(...args),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

const FUTURE = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()
const PAST = () => new Date(Date.now() - 60 * 60 * 1000).toISOString()

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
  getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', email: 'invitee@example.com' } } })
  switchActiveCompany.mockResolvedValue({ ok: true })
  inviteLookupResult.data = pendingInvite()
  inviteLookupResult.error = null
  flipResult.data = [{ id: 'inv_1' }] // 1 row affected = won the race
  flipResult.error = null
  memberUpsertResult.error = null
  updatePayload = undefined
  upsertPayload = undefined
  upsertOptions = undefined
  configureSupabase()
})

describe('SEAT-04: acceptInvite', () => {
  it('happy path: inserts the member with invite.role, flips invite, switches active company', async () => {
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_valid')

    // member inserted with role + company from the INVITE
    expect(membersUpsert).toHaveBeenCalledTimes(1)
    const member = upsertPayload as Record<string, unknown>
    expect(member.user_id).toBe('u1')
    expect(member.company_id).toBe('c1')
    expect(member.role).toBe('member') // sourced from invite.role

    // invite flipped to accepted (guarded WHERE status='pending')
    expect(invitesUpdate).toHaveBeenCalledTimes(1)
    expect((updatePayload as Record<string, unknown>).status).toBe('accepted')

    // active company switched to the invite's company
    expect(switchActiveCompany).toHaveBeenCalledWith('c1')

    expect(result).toEqual({ success: true })
  })

  it('drives role from the invite (admin invite → admin membership)', async () => {
    inviteLookupResult.data = pendingInvite({ role: 'admin' })
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    await acceptInvite('tok_valid')

    expect((upsertPayload as Record<string, unknown>).role).toBe('admin')
  })

  it('rejects an expired invite: no member insert, no flip, no switch', async () => {
    inviteLookupResult.data = pendingInvite({ expires_at: PAST() })
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_expired')

    expect(result).toHaveProperty('error')
    expect(membersUpsert).not.toHaveBeenCalled()
    expect(invitesUpdate).not.toHaveBeenCalled()
    expect(switchActiveCompany).not.toHaveBeenCalled()
  })

  it('rejects a revoked invite: no member insert, no flip', async () => {
    inviteLookupResult.data = pendingInvite({ status: 'revoked' })
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_revoked')

    expect(result).toHaveProperty('error')
    expect(membersUpsert).not.toHaveBeenCalled()
    expect(invitesUpdate).not.toHaveBeenCalled()
  })

  it('rejects an already-accepted invite (single-use)', async () => {
    inviteLookupResult.data = pendingInvite({ status: 'accepted' })
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_used')

    expect(result).toHaveProperty('error')
    expect(membersUpsert).not.toHaveBeenCalled()
    expect(invitesUpdate).not.toHaveBeenCalled()
  })

  it('rejects a lost single-use race: guarded flip returns 0 rows → no member insert, no switch', async () => {
    flipResult.data = [] // 0 rows affected = another accept won
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_valid')

    expect(result).toHaveProperty('error')
    // the flip was attempted (guarded) but lost
    expect(invitesUpdate).toHaveBeenCalledTimes(1)
    // no membership written and no active-company switch on a lost race
    expect(membersUpsert).not.toHaveBeenCalled()
    expect(switchActiveCompany).not.toHaveBeenCalled()
  })

  it('rejects an unknown token: no insert, no flip', async () => {
    inviteLookupResult.data = null
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_unknown')

    expect(result).toHaveProperty('error')
    expect(membersUpsert).not.toHaveBeenCalled()
    expect(invitesUpdate).not.toHaveBeenCalled()
  })

  it('rejects an email mismatch (case-insensitive): no insert, no flip', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', email: 'someone-else@example.com' } } })
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_valid')

    expect(result).toHaveProperty('error')
    expect(membersUpsert).not.toHaveBeenCalled()
    expect(invitesUpdate).not.toHaveBeenCalled()
  })

  it('matches email case-insensitively (mixed case still accepts)', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', email: 'Invitee@Example.COM' } } })
    inviteLookupResult.data = pendingInvite({ email: 'invitee@example.com' })
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_valid')

    expect(result).toEqual({ success: true })
    expect(membersUpsert).toHaveBeenCalledTimes(1)
  })

  it('rejects an unauthenticated caller: no claims → no insert', async () => {
    getClaims.mockResolvedValue({ data: { claims: null } })
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_valid')

    expect(result).toHaveProperty('error')
    expect(membersUpsert).not.toHaveBeenCalled()
    expect(invitesUpdate).not.toHaveBeenCalled()
  })

  it('is idempotent: ON CONFLICT member still flips the invite and switches company', async () => {
    // upsert with ignoreDuplicates resolves with no error even when the row exists
    memberUpsertResult.error = null
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const result = await acceptInvite('tok_valid')

    expect(membersUpsert).toHaveBeenCalledTimes(1)
    const opts = upsertOptions as Record<string, unknown>
    expect(opts.onConflict).toBe('user_id,company_id')
    expect(invitesUpdate).toHaveBeenCalledTimes(1)
    expect(switchActiveCompany).toHaveBeenCalledWith('c1')
    expect(result).toEqual({ success: true })
  })

  it('never logs the raw token', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
    ]
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const TOKEN = 'super-secret-token-value'
    await acceptInvite(TOKEN)

    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(TOKEN)
      }
      spy.mockRestore()
    }
  })
})
