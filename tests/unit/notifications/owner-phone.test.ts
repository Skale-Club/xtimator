import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * Phase 104 plan 00 — Wave-0 RED test for the owner-phone resolver (NOTIF-05).
 *
 * `@/lib/notifications/owner-phone` does NOT exist yet — Wave 2 creates
 * `resolveOwnerPhone(companyId, userId)`, a service-role read of the per-user
 * `company_whatsapp.owner_phone` (since migration 20260620000001). It returns the
 * E.164 number when an active row with a non-null owner_phone exists, else null,
 * and never throws on a DB error.
 *
 * RED form: module-not-found until Wave 2. Lazy `await import` keeps the file
 * collectable now. vi.mock is scoped + cleared in afterEach so cross-suite forks
 * runs don't leak the supabase mock.
 *
 * Owner: Wave 2 (104.2 — senders + phone/opt-in gating).
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
})

type SimpleResp<T = unknown> = { data: T; error: { message: string } | null }

function makeWhatsAppClient(maybeSingle: SimpleResp<unknown>) {
  const chain: Record<string, unknown> = {
    maybeSingle: vi.fn().mockResolvedValue(maybeSingle),
  }
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.not = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  const fromTable = { select: vi.fn().mockReturnValue(chain) }
  return {
    from: vi.fn().mockReturnValue(fromTable),
  }
}

describe('lib/notifications/owner-phone — resolveOwnerPhone() (NOTIF-05 RED)', () => {
  it('returns the E.164 owner_phone for an active row', async () => {
    const { resolveOwnerPhone } = await import('@/lib/notifications/owner-phone')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeWhatsAppClient({
        data: { owner_phone: '+15551230000', status: 'active' },
        error: null,
      }),
    )
    const phone = await resolveOwnerPhone('co_1', 'user_1')
    expect(phone).toBe('+15551230000')
  })

  it('returns null when no row / owner_phone is null', async () => {
    const { resolveOwnerPhone } = await import('@/lib/notifications/owner-phone')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeWhatsAppClient({ data: null, error: null }),
    )
    const phone = await resolveOwnerPhone('co_1', 'user_1')
    expect(phone).toBeNull()
  })

  it('never throws on a DB error → returns null', async () => {
    const { resolveOwnerPhone } = await import('@/lib/notifications/owner-phone')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeWhatsAppClient({ data: null, error: { message: 'connection refused' } }),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const phone = await resolveOwnerPhone('co_1', 'user_1')
    expect(phone).toBeNull()
    warn.mockRestore()
  })
})
