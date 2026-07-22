import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

/**
 * lib/observability/platform-preferences.ts — Phase 175 (PLAT-02/PLAT-03)
 * Telegram delivery gate for platform events.
 *
 * Mocks @/lib/supabase/service exactly like
 * tests/unit/notifications/whatsapp-registry.test.ts does. Covers:
 *  - locked kinds (pipeline_stuck, cron_failed) bypass the DB check entirely
 *    and always resolve true, even when the mocked row says false
 *  - non-locked kinds honor the stored DB row (true/false)
 *  - fail-open: no matching row, no service client, or a rejecting query all
 *    resolve true
 *  - invalidatePlatformPreferencesCache() forces a re-query past the 30s TTL
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

type SimpleResp<T = unknown> = { data: T; error: { message: string } | null }

/** Chainable stub matching .from().select() → resolved (or rejecting) result. */
function makePreferencesClient(select: SimpleResp<unknown> | (() => Promise<never>)) {
  const chain: Record<string, unknown> = {}
  chain.select =
    typeof select === 'function' ? vi.fn().mockImplementation(select) : vi.fn().mockResolvedValue(select)
  return { from: vi.fn().mockReturnValue(chain) }
}

describe('lib/observability/platform-preferences — isTelegramAlertEnabled()', () => {
  it('pipeline_stuck always resolves true, even when the mocked row says telegram_enabled: false', async () => {
    const { isTelegramAlertEnabled } = await import('@/lib/observability/platform-preferences')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePreferencesClient({
        data: [{ event_kind: 'pipeline_stuck', telegram_enabled: false }],
        error: null,
      })
    )

    await expect(isTelegramAlertEnabled('pipeline_stuck')).resolves.toBe(true)
  })

  it('cron_failed always resolves true, even when the mocked row says telegram_enabled: false', async () => {
    const { isTelegramAlertEnabled } = await import('@/lib/observability/platform-preferences')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePreferencesClient({
        data: [{ event_kind: 'cron_failed', telegram_enabled: false }],
        error: null,
      })
    )

    await expect(isTelegramAlertEnabled('cron_failed')).resolves.toBe(true)
  })

  it('honors the DB row for a non-locked kind: true when the row says true', async () => {
    const { isTelegramAlertEnabled } = await import('@/lib/observability/platform-preferences')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePreferencesClient({
        data: [{ event_kind: 'tenant_signup', telegram_enabled: true }],
        error: null,
      })
    )

    await expect(isTelegramAlertEnabled('tenant_signup')).resolves.toBe(true)
  })

  it('honors the DB row for a non-locked kind: false when the row says false', async () => {
    const { isTelegramAlertEnabled } = await import('@/lib/observability/platform-preferences')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePreferencesClient({
        data: [{ event_kind: 'tenant_signup', telegram_enabled: false }],
        error: null,
      })
    )

    await expect(isTelegramAlertEnabled('tenant_signup')).resolves.toBe(false)
  })

  it('fails open (true) when no matching row exists in the result set', async () => {
    const { isTelegramAlertEnabled } = await import('@/lib/observability/platform-preferences')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePreferencesClient({
        data: [{ event_kind: 'some_other_kind', telegram_enabled: false }],
        error: null,
      })
    )

    await expect(isTelegramAlertEnabled('tenant_signup')).resolves.toBe(true)
  })

  it('fails open (true) when no service client is available', async () => {
    const { isTelegramAlertEnabled } = await import('@/lib/observability/platform-preferences')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(null)

    await expect(isTelegramAlertEnabled('tenant_signup')).resolves.toBe(true)
  })

  it('fails open (true) and warns when the DB query rejects', async () => {
    const { isTelegramAlertEnabled } = await import('@/lib/observability/platform-preferences')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makePreferencesClient(() => Promise.reject(new Error('connection refused')))
    )

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(isTelegramAlertEnabled('tenant_signup')).resolves.toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('invalidatePlatformPreferencesCache() forces the next call to re-query rather than serve the cached map', async () => {
    const { isTelegramAlertEnabled, invalidatePlatformPreferencesCache } = await import(
      '@/lib/observability/platform-preferences'
    )
    const { createServiceClient } = await import('@/lib/supabase/service')

    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      makePreferencesClient({
        data: [{ event_kind: 'tenant_signup', telegram_enabled: false }],
        error: null,
      })
    )
    await expect(isTelegramAlertEnabled('tenant_signup')).resolves.toBe(false)

    // Without invalidation, the 30s cache would still serve `false` here even
    // though the mock now returns `true` — proving the cache is in effect.
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      makePreferencesClient({
        data: [{ event_kind: 'tenant_signup', telegram_enabled: true }],
        error: null,
      })
    )
    await expect(isTelegramAlertEnabled('tenant_signup')).resolves.toBe(false)

    invalidatePlatformPreferencesCache()

    await expect(isTelegramAlertEnabled('tenant_signup')).resolves.toBe(true)
  })
})
