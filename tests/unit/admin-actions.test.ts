import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Unit tests for app/admin/admins/actions.ts (Plan 06 — ADMIN-03).
 *
 * Covers:
 *  - addPlatformAdmin: happy path, email-not-found, already-admin
 *  - removePlatformAdmin: happy path, last-admin trigger translation, generic error
 *
 * Mocks:
 *  - @/lib/auth/admin-context (requireAdmin → fixed AdminContext)
 *  - @/lib/supabase/service (chainable client)
 *  - @/lib/schemas/admin (addAdminSchema — plan 04 owns the real one; mocked here so
 *    these tests don't block on cross-plan dependency at parallel-wave time)
 *  - next/cache (revalidatePath spy)
 */

vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ userId: 'admin-self', email: 'self@example.com' }),
}))

vi.mock('@/lib/supabase/service', () => {
  // Product code calls requireServiceClient(); alias both exports to one spy so tests
  // that configure createServiceClient.mockReturnValue(...) also drive requireServiceClient().
  const client = vi.fn()
  return { createServiceClient: client, requireServiceClient: client }
})

vi.mock('@/lib/schemas/admin', () => {
  const z = require('zod') as typeof import('zod')
  return {
    addAdminSchema: z.object({ email: z.string().email() }),
  }
})

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

type ListUsersResponse = { data: { users: Array<{ id: string; email?: string }> } | null; error?: unknown }
type SimpleResponse<T = unknown> = { data: T; error: { message: string } | null }

/**
 * Build a chainable Supabase service mock.
 *
 * Optional `responses` configures terminal call results for each table-level operation:
 *   - selectMaybeSingle: result returned by `.from(...).select(...).eq(...).maybeSingle()`
 *   - insert: result returned by `.from(...).insert(...)`
 *   - delete: result returned by `.from(...).delete().eq(...)`
 *
 * Auth admin listUsers result is configured separately.
 */
function makeServiceClient(opts: {
  selectMaybeSingle?: SimpleResponse<unknown>
  insert?: SimpleResponse<unknown>
  delete?: SimpleResponse<unknown>
  listUsers?: ListUsersResponse
}) {
  const selectChain: Record<string, unknown> = {
    maybeSingle: vi.fn().mockResolvedValue(opts.selectMaybeSingle ?? { data: null, error: null }),
  }
  selectChain.eq = vi.fn().mockReturnValue(selectChain)

  const deleteChain: Record<string, unknown> = {}
  deleteChain.eq = vi.fn().mockResolvedValue(opts.delete ?? { data: null, error: null })

  const fromTable = {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockResolvedValue(opts.insert ?? { data: null, error: null }),
    delete: vi.fn().mockReturnValue(deleteChain),
  }

  return {
    from: vi.fn().mockReturnValue(fromTable),
    auth: {
      admin: {
        listUsers: vi.fn().mockResolvedValue(opts.listUsers ?? { data: { users: [] }, error: null }),
      },
    },
  }
}

describe('app/admin/admins/actions (ADMIN-03)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('addPlatformAdmin', () => {
    it('returns { ok: true } when user exists, is not already admin, insert succeeds', async () => {
      const svcModule = await import('@/lib/supabase/service')
      ;(svcModule.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        makeServiceClient({
          listUsers: { data: { users: [{ id: 'user-new', email: 'new@example.com' }] }, error: null },
          selectMaybeSingle: { data: null, error: null },
          insert: { data: null, error: null },
        })
      )

      const { addPlatformAdmin } = await import('@/app/admin/admins/actions')
      const result = await addPlatformAdmin({ email: 'new@example.com' })
      expect(result).toEqual({ ok: true })
    })

    it('returns friendly error when no user is registered with that email', async () => {
      const svcModule = await import('@/lib/supabase/service')
      ;(svcModule.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        makeServiceClient({
          listUsers: { data: { users: [] }, error: null },
        })
      )

      const { addPlatformAdmin } = await import('@/app/admin/admins/actions')
      const result = await addPlatformAdmin({ email: 'ghost@example.com' })
      expect(result.ok).toBe(false)
      expect((result as { ok: false; message: string }).message).toMatch(/No user registered/i)
    })

    it('returns friendly error when user is already a platform admin', async () => {
      const svcModule = await import('@/lib/supabase/service')
      ;(svcModule.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        makeServiceClient({
          listUsers: { data: { users: [{ id: 'user-existing', email: 'dup@example.com' }] }, error: null },
          selectMaybeSingle: { data: { user_id: 'user-existing' }, error: null },
        })
      )

      const { addPlatformAdmin } = await import('@/app/admin/admins/actions')
      const result = await addPlatformAdmin({ email: 'dup@example.com' })
      expect(result.ok).toBe(false)
      expect((result as { ok: false; message: string }).message).toMatch(/already a platform admin/i)
    })
  })

  describe('removePlatformAdmin', () => {
    it('returns { ok: true } on successful delete', async () => {
      const svcModule = await import('@/lib/supabase/service')
      ;(svcModule.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        makeServiceClient({
          delete: { data: null, error: null },
        })
      )

      const { removePlatformAdmin } = await import('@/app/admin/admins/actions')
      const result = await removePlatformAdmin({ userId: 'user-victim' })
      expect(result).toEqual({ ok: true })
    })

    it('translates last-admin trigger error into UI-SPEC copy', async () => {
      const svcModule = await import('@/lib/supabase/service')
      ;(svcModule.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        makeServiceClient({
          delete: { data: null, error: { message: 'Cannot remove the last platform admin' } },
        })
      )

      const { removePlatformAdmin } = await import('@/app/admin/admins/actions')
      const result = await removePlatformAdmin({ userId: 'admin-self' })
      expect(result.ok).toBe(false)
      expect((result as { ok: false; message: string }).message).toMatch(/Cannot remove the last platform admin/i)
    })

    it('passes through generic delete errors as the message', async () => {
      const svcModule = await import('@/lib/supabase/service')
      ;(svcModule.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        makeServiceClient({
          delete: { data: null, error: { message: 'connection refused' } },
        })
      )

      const { removePlatformAdmin } = await import('@/app/admin/admins/actions')
      const result = await removePlatformAdmin({ userId: 'someone' })
      expect(result.ok).toBe(false)
      expect((result as { ok: false; message: string }).message).toBe('connection refused')
    })
  })
})
