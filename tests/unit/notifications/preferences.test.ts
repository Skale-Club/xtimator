import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Phase 77 plan 01 — Wave-0 RED tests for preferences resolution.
 *
 * Imports `resolveChannels` from `@/lib/notifications/preferences`, which does
 * NOT exist yet (plan 77-02 creates it). Expected state: RED with
 * "Cannot find module" or equivalent. Plan 77-02 turns them GREEN.
 *
 * Covers:
 *  - Returns { inApp, email } shape based on event category
 *  - Falls back to DEFAULT_PREFERENCES when user row missing
 *  - Honors per-category override in prefs.categories JSONB
 *  - channels override param wins over prefs
 *  - ai_job default is { in_app: false, email: false }
 *  - email_digest_enabled=false disables email even if category enables it
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

type SimpleResp<T = unknown> = { data: T; error: { message: string } | null }

function makePrefsClient(maybeSingle: SimpleResp<unknown>) {
  const chain: Record<string, unknown> = {
    maybeSingle: vi.fn().mockResolvedValue(maybeSingle),
  }
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  const fromTable = { select: vi.fn().mockReturnValue(chain) }
  return {
    from: vi.fn().mockReturnValue(fromTable),
  }
}

describe('lib/notifications/preferences — resolveChannels() (NOTIF-02 + NOTIF-12 RED)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns { inApp, email } based on event category', async () => {
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePrefsClient({ data: null, error: null }),
    )
    const result = await resolveChannels('estimate.viewed', 'user_1')
    expect(result).toMatchObject({ inApp: expect.any(Boolean), email: expect.any(Boolean) })
  })

  it('uses DEFAULT_PREFERENCES when user has no preferences row', async () => {
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePrefsClient({ data: null, error: null }),
    )
    // 'estimate' default is { in_app: true, email: true }
    const result = await resolveChannels('estimate.viewed', 'user_1')
    expect(result.inApp).toBe(true)
    expect(result.email).toBe(true)
  })

  it('honors per-category override from prefs.categories JSONB', async () => {
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePrefsClient({
        data: {
          user_id: 'user_1',
          categories: { estimate: { in_app: false, email: true } },
          email_digest_enabled: true,
        },
        error: null,
      }),
    )
    const result = await resolveChannels('estimate.viewed', 'user_1')
    expect(result.inApp).toBe(false)
    expect(result.email).toBe(true)
  })

  it('channels override param wins over stored prefs', async () => {
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePrefsClient({
        data: {
          user_id: 'user_1',
          categories: { trial: { in_app: false, email: false } },
          email_digest_enabled: false,
        },
        error: null,
      }),
    )
    const result = await resolveChannels('trial.expired', 'user_1', { inApp: true, email: true })
    expect(result.inApp).toBe(true)
    expect(result.email).toBe(true)
  })

  it('ai_job category defaults to { in_app: false, email: false }', async () => {
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePrefsClient({ data: null, error: null }),
    )
    const result = await resolveChannels('ai_job.failed', 'user_1')
    expect(result.inApp).toBe(false)
    expect(result.email).toBe(false)
  })

  it('email_digest_enabled=false disables email even if category enables it', async () => {
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePrefsClient({
        data: {
          user_id: 'user_1',
          categories: { payment: { in_app: true, email: true } },
          email_digest_enabled: false,
        },
        error: null,
      }),
    )
    const result = await resolveChannels('payment.received', 'user_1')
    expect(result.email).toBe(false)
    expect(result.inApp).toBe(true)
  })
})

/**
 * Phase 104 plan 00 — Wave-0 EXTEND (NOTIF-02): 4-channel resolution + opt-in gate.
 *
 * RED until Wave 1 widens ResolvedChannels to { inApp, email, whatsapp, sms } and
 * Wave 2 adds the phone/opt-in gate. The Wave-2 contract: `resolveChannels` returns
 * the four keys; whatsapp/sms default false (opt-in + paid). The phone/opt-in gate
 * keeps whatsapp/sms false unless the verified-phone + per-channel opt-in is
 * satisfied — INCLUDING the explicit TCPA/consent defense that a category sms
 * toggle alone (no recorded sms_opt_in_at) does NOT send.
 */
describe('lib/notifications/preferences — 4 channels + opt-in gate (NOTIF-02 RED)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a 4-key { inApp, email, whatsapp, sms } object', async () => {
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePrefsClient({ data: null, error: null }),
    )
    const result = await resolveChannels('billing.invoice' as never, 'user_1')
    expect(Object.keys(result).sort()).toEqual(['email', 'inApp', 'sms', 'whatsapp'])
  })

  it('whatsapp/sms resolve false by default (opt-in, no phone)', async () => {
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePrefsClient({ data: null, error: null }),
    )
    const result = await resolveChannels('estimate.viewed', 'user_1') as unknown as Record<string, boolean>
    expect(result.whatsapp).toBe(false)
    expect(result.sms).toBe(false)
  })

  it('TCPA gate: category sms toggle ON but NO sms_opt_in_at → sms stays false', async () => {
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePrefsClient({
        data: {
          user_id: 'user_1',
          // Owner flipped the per-category sms toggle on...
          categories: { billing: { in_app: true, email: true, sms: true, whatsapp: true } },
          email_digest_enabled: true,
          // ...but never recorded explicit SMS consent (no sms_opt_in_at).
          sms_opt_in_at: null,
        },
        error: null,
      }),
    )
    const result = await resolveChannels('payment.received', 'user_1') as unknown as Record<string, boolean>
    // Consent is required before any SMS — the toggle alone must NOT send (TCPA).
    expect(result.sms).toBe(false)
  })
})
