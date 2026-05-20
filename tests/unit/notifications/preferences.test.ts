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
