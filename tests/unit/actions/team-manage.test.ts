import { describe, it, expect, vi, beforeEach } from 'vitest'
import { XtimatorError } from '@/lib/errors'

/**
 * SEAT-05 — removeMember + changeMemberRole server actions (lib/actions/team.ts).
 *
 * Boundaries mocked: the single role gate (requireCompanyManager), the
 * service-role Supabase client (per-table router), and next/cache
 * revalidatePath. The target module is late-imported inside each test per the
 * team-invite.test.ts idiom.
 *
 * Covers the full matrix + guards: happy delete/update, last-owner protection,
 * owner-target protection, role-enum rejection, and gate-deny (no write).
 */

// ─── role gate ──────────────────────────────────────────────────────────────
const requireCompanyManager = vi.fn()
vi.mock('@/lib/auth/require-company-role', () => ({
  requireCompanyManager: (...args: unknown[]) => requireCompanyManager(...args),
}))

// ─── next/cache ─────────────────────────────────────────────────────────────
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ─── demo guard (Phase 180) ─────────────────────────────────────────────────
// changeMemberRole/removeMember call assertWritable() ambiently; mocked
// directly so this suite stays isolated to SEAT-05, not demo-guard internals
// (covered separately in tests/unit/demo/*).
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn(async () => null),
  assertCompanyWritable: vi.fn(async () => null),
}))

// ─── service-role Supabase per-table mock ───────────────────────────────────
// The target-role lookup: .select('role').eq().eq().maybeSingle()
const targetLookupResult = { data: null as Record<string, unknown> | null, error: null as unknown }

const membersDelete = vi.fn()
const membersUpdate = vi.fn()
const fromImpl = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: (t: string) => fromImpl(t) }),
}))

function configureSupabase() {
  membersDelete.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  })
  membersUpdate.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  })

  fromImpl.mockImplementation((table: string) => {
    if (table === 'company_members') {
      return {
        // .select('role').eq('company_id', ...).eq('user_id', ...).maybeSingle()
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(targetLookupResult),
            }),
          }),
        }),
        // .delete().eq().eq()
        delete: (...args: unknown[]) => membersDelete(...args),
        // .update({ role }).eq().eq()
        update: (...args: unknown[]) => membersUpdate(...args),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireCompanyManager.mockResolvedValue({ userId: 'u1', companyId: 'c1', role: 'admin' })
  targetLookupResult.data = { role: 'member' }
  targetLookupResult.error = null
  configureSupabase()
})

describe('SEAT-05: removeMember', () => {
  it('admin removes a member: deletes the company_members row, returns success', async () => {
    const { removeMember } = await import('@/lib/actions/team')

    const result = await removeMember('c1', 'target-user')

    expect(requireCompanyManager).toHaveBeenCalledWith('c1')
    expect(membersDelete).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ success: true })
  })

  it('refuses to delete an owner row (last-owner guard): no delete', async () => {
    targetLookupResult.data = { role: 'owner' }
    const { removeMember } = await import('@/lib/actions/team')

    const result = await removeMember('c1', 'owner-user')

    expect(result).toHaveProperty('error')
    expect(membersDelete).not.toHaveBeenCalled()
  })

  it('returns error when the target member does not exist: no delete', async () => {
    targetLookupResult.data = null
    const { removeMember } = await import('@/lib/actions/team')

    const result = await removeMember('c1', 'ghost')

    expect(result).toHaveProperty('error')
    expect(membersDelete).not.toHaveBeenCalled()
  })

  it('blocked when the gate throws (non-manager): no delete attempted', async () => {
    requireCompanyManager.mockRejectedValueOnce(
      new XtimatorError('forbidden', 'company', 'Insufficient company role')
    )
    const { removeMember } = await import('@/lib/actions/team')

    const result = await removeMember('c1', 'target-user')

    expect(result).toHaveProperty('error')
    expect(membersDelete).not.toHaveBeenCalled()
  })
})

describe('SEAT-05: changeMemberRole', () => {
  it('admin sets a member to admin: updates role, returns success', async () => {
    const { changeMemberRole } = await import('@/lib/actions/team')

    const result = await changeMemberRole('c1', 'target-user', 'admin')

    expect(requireCompanyManager).toHaveBeenCalledWith('c1')
    expect(membersUpdate).toHaveBeenCalledTimes(1)
    expect((membersUpdate.mock.calls[0][0] as Record<string, unknown>).role).toBe('admin')
    expect(result).toEqual({ success: true })
  })

  it('admin sets a member to member: updates with { role: "member" }', async () => {
    targetLookupResult.data = { role: 'admin' }
    const { changeMemberRole } = await import('@/lib/actions/team')

    const result = await changeMemberRole('c1', 'target-user', 'member')

    expect(membersUpdate).toHaveBeenCalledTimes(1)
    expect((membersUpdate.mock.calls[0][0] as Record<string, unknown>).role).toBe('member')
    expect(result).toEqual({ success: true })
  })

  it("rejects role 'owner' at the zod boundary: no update", async () => {
    const { changeMemberRole } = await import('@/lib/actions/team')

    const result = await changeMemberRole('c1', 'target-user', 'owner' as 'admin')

    expect(result).toHaveProperty('error')
    expect(membersUpdate).not.toHaveBeenCalled()
  })

  it("rejects an empty/invalid role: no update", async () => {
    const { changeMemberRole } = await import('@/lib/actions/team')

    const result = await changeMemberRole('c1', 'target-user', '' as 'admin')

    expect(result).toHaveProperty('error')
    expect(membersUpdate).not.toHaveBeenCalled()
  })

  it('refuses to target an owner row (owner-target guard): no update', async () => {
    targetLookupResult.data = { role: 'owner' }
    const { changeMemberRole } = await import('@/lib/actions/team')

    const result = await changeMemberRole('c1', 'owner-user', 'member')

    expect(result).toHaveProperty('error')
    expect(membersUpdate).not.toHaveBeenCalled()
  })

  it('returns error when the target member does not exist: no update', async () => {
    targetLookupResult.data = null
    const { changeMemberRole } = await import('@/lib/actions/team')

    const result = await changeMemberRole('c1', 'ghost', 'member')

    expect(result).toHaveProperty('error')
    expect(membersUpdate).not.toHaveBeenCalled()
  })

  it('blocked when the gate throws (non-manager): no update attempted', async () => {
    requireCompanyManager.mockRejectedValueOnce(
      new XtimatorError('forbidden', 'company', 'Insufficient company role')
    )
    const { changeMemberRole } = await import('@/lib/actions/team')

    const result = await changeMemberRole('c1', 'target-user', 'member')

    expect(result).toHaveProperty('error')
    expect(membersUpdate).not.toHaveBeenCalled()
  })
})
