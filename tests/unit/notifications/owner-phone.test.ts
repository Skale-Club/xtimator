import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * Phase 142.1 Plan 06 — Owner-phone resolver updated to read from
 * whatsapp_authorized_senders (admin-provisioned registry) instead of
 * legacy company_whatsapp.
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
})

type SimpleResp<T = unknown> = { data: T; error: { message: string } | null }

function makeSenderClient(maybeSingle: SimpleResp<unknown>) {
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

describe('lib/notifications/owner-phone — resolveOwnerPhone() via registry', () => {
  it('returns the E.164 phone from whatsapp_authorized_senders for an active row', async () => {
    const { resolveOwnerPhone } = await import('@/lib/notifications/owner-phone')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSenderClient({
        data: { phone_e164: '+15551230000', status: 'active' },
        error: null,
      }),
    )
    const phone = await resolveOwnerPhone('co_1', 'user_1')
    expect(phone).toBe('+15551230000')
  })

  it('returns null when no row / phone_e164 is null', async () => {
    const { resolveOwnerPhone } = await import('@/lib/notifications/owner-phone')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSenderClient({ data: null, error: null }),
    )
    const phone = await resolveOwnerPhone('co_1', 'user_1')
    expect(phone).toBeNull()
  })

  it('never throws on a DB error → returns null', async () => {
    const { resolveOwnerPhone } = await import('@/lib/notifications/owner-phone')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSenderClient({ data: null, error: { message: 'connection refused' } }),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const phone = await resolveOwnerPhone('co_1', 'user_1')
    expect(phone).toBeNull()
    warn.mockRestore()
  })
})
