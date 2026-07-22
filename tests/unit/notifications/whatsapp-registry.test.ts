import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * Phase 104.3 — DB-backed template resolver `getApprovedTemplateForEvent`.
 *
 * Exercises the REAL resolver (module NOT mocked) against a mocked Supabase
 * service client, covering the two branches the dispatch wiring depends on:
 *   (a) an APPROVED `whatsapp_notification_templates` row wins over the static map
 *   (b) no approved row → falls back to the static REGISTRY (mapped) / null (unmapped)
 * plus the two safety fallbacks: no service client, and a throwing DB query.
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
})

type SimpleResp<T = unknown> = { data: T; error: { message: string } | null }

/** Chainable stub matching .from().select().eq().eq().order().limit().maybeSingle(). */
function makeTemplateClient(maybeSingle: SimpleResp<unknown> | (() => Promise<never>)) {
  const chain: Record<string, unknown> = {
    maybeSingle:
      typeof maybeSingle === 'function'
        ? vi.fn().mockImplementation(maybeSingle)
        : vi.fn().mockResolvedValue(maybeSingle),
  }
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  return { from: vi.fn().mockReturnValue(chain) }
}

describe('lib/notifications/whatsapp-registry — getApprovedTemplateForEvent()', () => {
  it('(a) an approved DB row WINS over the static map for the same event', async () => {
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({
        data: { template_name: 'db_owner_estimate', language_code: 'pt_BR' },
        error: null,
      }),
    )

    // 'estimate.accepted' is mapped statically to 'owner_estimate_update' — the DB row must win.
    const tpl = await getApprovedTemplateForEvent('estimate.accepted')
    expect(tpl?.templateName).toBe('db_owner_estimate')
    expect(tpl?.languageCode).toBe('pt_BR')
    expect(tpl?.variables({ title: 'T', body: 'B' })).toEqual(['T', 'B'])
  })

  it('(a) defaults languageCode to en_US when the approved row omits it', async () => {
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({
        data: { template_name: 'db_owner_estimate', language_code: null },
        error: null,
      }),
    )

    const tpl = await getApprovedTemplateForEvent('estimate.accepted')
    expect(tpl?.templateName).toBe('db_owner_estimate')
    expect(tpl?.languageCode).toBe('en_US')
  })

  it('(b) no approved DB row → falls back to the static map for a mapped event', async () => {
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({ data: null, error: null }),
    )

    const tpl = await getApprovedTemplateForEvent('payment.received')
    expect(tpl?.templateName).toBe('owner_billing_alert')
    expect(tpl?.languageCode).toBe('en_US')
  })

  it('(b) no approved DB row → returns null for an UNmapped event', async () => {
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({ data: null, error: null }),
    )

    const tpl = await getApprovedTemplateForEvent('estimate.viewed')
    expect(tpl).toBeNull()
  })

  it('falls back to the static map when no service client is available', async () => {
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(null)

    const tpl = await getApprovedTemplateForEvent('quota.exhausted')
    expect(tpl?.templateName).toBe('owner_billing_alert')
  })

  it('never throws on a DB error → warns and falls back to the static map', async () => {
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient(() => Promise.reject(new Error('connection refused'))),
    )

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tpl = await getApprovedTemplateForEvent('estimate.declined')
    expect(tpl?.templateName).toBe('owner_estimate_update')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

/**
 * Phase 174 plan 03 (TNT-03 / Pitfall 3) — expectedVariableCount.
 *
 * Every NotificationTemplate (DB-approved or static-fallback) now carries the
 * expected `{{n}}` variable count Plan 174-04's runtime guard reads. DB rows
 * source it from `variables_schema.length`; the 5 static REGISTRY entries
 * hardcode 2 (matching titleBodyVars's own fixed output) — a structural
 * no-op for those, documented honestly rather than pretending it's a guard.
 */
describe('lib/notifications/whatsapp-registry — expectedVariableCount (TNT-03 / Pitfall 3)', () => {
  it('an approved DB row with a 2-element variables_schema → expectedVariableCount 2', async () => {
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({
        data: {
          template_name: 'db_owner_estimate',
          language_code: 'en_US',
          variables_schema: ['title', 'body'],
        },
        error: null,
      }),
    )

    const tpl = await getApprovedTemplateForEvent('estimate.accepted')
    expect(tpl?.expectedVariableCount).toBe(2)
  })

  it('an approved DB row with an empty (unconfigured) variables_schema → expectedVariableCount 0', async () => {
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({
        data: {
          template_name: 'db_owner_estimate',
          language_code: 'en_US',
          variables_schema: [],
        },
        error: null,
      }),
    )

    const tpl = await getApprovedTemplateForEvent('estimate.accepted')
    expect(tpl?.expectedVariableCount).toBe(0)
  })

  it('an approved DB row with a missing/null variables_schema → expectedVariableCount 0, never throws', async () => {
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({
        data: {
          template_name: 'db_owner_estimate',
          language_code: 'en_US',
          variables_schema: null,
        },
        error: null,
      }),
    )

    const tpl = await getApprovedTemplateForEvent('estimate.accepted')
    expect(tpl?.expectedVariableCount).toBe(0)
  })

  it('falling back to the static map (no approved row) → expectedVariableCount 2', async () => {
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({ data: null, error: null }),
    )

    const tpl = await getApprovedTemplateForEvent('payment.received')
    expect(tpl?.expectedVariableCount).toBe(2)
  })

  it('falling back to the static map (no service client) → expectedVariableCount 2', async () => {
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(null)

    const tpl = await getApprovedTemplateForEvent('quota.exhausted')
    expect(tpl?.expectedVariableCount).toBe(2)
  })

  it('falling back to the static map (throwing query) → expectedVariableCount 2', async () => {
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient(() => Promise.reject(new Error('connection refused'))),
    )

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tpl = await getApprovedTemplateForEvent('estimate.declined')
    expect(tpl?.expectedVariableCount).toBe(2)
    warn.mockRestore()
  })

  it('getTemplateForEvent (sync static-only) also carries expectedVariableCount: 2 for a mapped event', async () => {
    const { getTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const tpl = getTemplateForEvent('trial.expiring_3d')
    expect(tpl?.expectedVariableCount).toBe(2)
  })
})
