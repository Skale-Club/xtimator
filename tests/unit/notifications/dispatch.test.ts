import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Phase 77 plan 01 — Wave-0 RED tests for the dispatch helper.
 *
 * These tests import `notify` from `@/lib/notifications/dispatch`, which does
 * NOT exist yet (plan 77-02 creates it). Expected state: RED with
 * "Cannot find module" or equivalent. Plan 77-02 turns them GREEN.
 *
 * Covers:
 *  - Happy-path insert returns { ok: true, notificationId }
 *  - Best-effort failure (does NOT throw, returns { ok: false })
 *  - channels.inApp=false skips notifications row insert
 *  - metadata.dedupe_key skips when duplicate exists within 24h
 *  - channels.email=true queues an Inngest event
 *  - user_id=null creates a company-wide row
 *  - Default channel resolution defers to preferences
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['evt_1'] }) },
}))

vi.mock('@/lib/notifications/preferences', () => ({
  // Phase 104 (NOTIF-07): 4-channel resolved shape. whatsapp/sms added (default
  // false) so existing Phase-77 cases (which only assert inApp/email) stay green.
  resolveChannels: vi
    .fn()
    .mockResolvedValue({ inApp: true, email: false, whatsapp: false, sms: false }),
}))

// Phase 104 — owner-phone resolver + registry the WhatsApp branch consumes (Wave 2).
// Mocked here so the EXTEND cases below compile before the modules exist (RED).
vi.mock('@/lib/notifications/owner-phone', () => ({
  resolveOwnerPhone: vi.fn().mockResolvedValue('+15551230000'),
}))

vi.mock('@/lib/notifications/whatsapp-registry', () => ({
  getTemplateForEvent: vi.fn().mockReturnValue({
    templateName: 'owner_billing_alert',
    languageCode: 'en_US',
    variables: () => ['Acme', '$100'],
  }),
}))

type SimpleResp<T = unknown> = { data: T; error: { message: string } | null }

function makeServiceClient(opts: {
  insertSingle?: SimpleResp<{ id: string } | null>
  dedupeMaybeSingle?: SimpleResp<{ id: string } | null>
}) {
  const insertChain: Record<string, unknown> = {
    single: vi.fn().mockResolvedValue(opts.insertSingle ?? { data: { id: 'notif_new' }, error: null }),
  }
  insertChain.select = vi.fn().mockReturnValue(insertChain)

  const dedupeChain: Record<string, unknown> = {
    maybeSingle: vi.fn().mockResolvedValue(opts.dedupeMaybeSingle ?? { data: null, error: null }),
  }
  dedupeChain.gte = vi.fn().mockReturnValue(dedupeChain)
  dedupeChain.eq = vi.fn().mockReturnValue(dedupeChain)
  dedupeChain.contains = vi.fn().mockReturnValue(dedupeChain)
  dedupeChain.limit = vi.fn().mockReturnValue(dedupeChain)

  const selectChain: Record<string, unknown> = dedupeChain
  selectChain.eq = vi.fn().mockReturnValue(selectChain)

  const fromTable = {
    insert: vi.fn().mockReturnValue(insertChain),
    select: vi.fn().mockReturnValue(selectChain),
  }
  return {
    from: vi.fn().mockReturnValue(fromTable),
    __from: fromTable,
  }
}

describe('lib/notifications/dispatch — notify() (NOTIF-01 + NOTIF-12 RED)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a row with given title/body/event_type and returns ok:true', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = makeServiceClient({ insertSingle: { data: { id: 'notif_123' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const result = await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'estimate.viewed',
      title: 'Estimate viewed',
      body: 'Acme Co viewed your estimate',
    })

    expect(result.ok).toBe(true)
    expect(result.notificationId).toBe('notif_123')
    expect(svc.from).toHaveBeenCalledWith('notifications')
  })

  it('returns ok:false on DB failure WITHOUT throwing (best-effort pattern)', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = makeServiceClient({
      insertSingle: { data: null, error: { message: 'connection refused' } },
    })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'payment.received',
      title: 'Payment received',
      body: '$100',
    })
    expect(result.ok).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('respects channels.inApp=false → skips notifications row insert', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = makeServiceClient({})
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'ai_job.completed',
      title: 't',
      body: 'b',
      channels: { inApp: false, email: false },
    })

    expect(svc.__from.insert).not.toHaveBeenCalled()
  })

  it('skips insert when metadata.dedupe_key matches existing row in last 24h', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = makeServiceClient({
      dedupeMaybeSingle: { data: { id: 'existing_notif' }, error: null },
    })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const result = await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'payment.received',
      title: 't',
      body: 'b',
      metadata: { dedupe_key: 'stripe_evt_abc' },
    })
    expect(result.ok).toBe(true)
    expect(result.notificationId).toBe('existing_notif')
    expect(svc.__from.insert).not.toHaveBeenCalled()
  })

  it('queues an Inngest event when channels.email=true', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { inngest } = await import('@/lib/inngest/client')
    const svc = makeServiceClient({})
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'trial.expired',
      title: 'Trial expired',
      body: 'Upgrade to keep going',
      channels: { inApp: true, email: true },
    })

    expect(inngest.send).toHaveBeenCalled()
  })

  it('creates a company-wide row when user_id is null', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = makeServiceClient({ insertSingle: { data: { id: 'notif_co_wide' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const result = await notify({
      companyId: 'co_1',
      userId: null,
      eventType: 'system.maintenance',
      title: 'Maintenance window',
      body: 'Tonight 22:00 UTC',
    })
    expect(result.ok).toBe(true)
    const insertCall = (svc.__from.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(insertCall).toMatchObject({ user_id: null, company_id: 'co_1' })
  })

  it('defers channel selection to resolveChannels when channels override not provided', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const svc = makeServiceClient({})
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'estimate.accepted',
      title: 't',
      body: 'b',
    })
    expect(resolveChannels).toHaveBeenCalled()
  })
})

/**
 * Phase 104 plan 00 — Wave-0 EXTEND (NOTIF-07): 4-channel routing + best-effort.
 *
 * These cases are RED until Wave 2 adds the whatsapp/sms branches to notify().
 * They assert: (1) enabling whatsapp/sms fires the corresponding async dispatch,
 * and (2) a THROWING whatsapp/sms send does NOT block the in-app notifications
 * insert and never makes notify() throw (Research Pitfall 4).
 */
describe('lib/notifications/dispatch — 4-channel routing + best-effort (NOTIF-07 RED)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dispatches a whatsapp/sms send via Inngest when those channels resolve true', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { inngest } = await import('@/lib/inngest/client')
    const svc = makeServiceClient({})
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(resolveChannels as ReturnType<typeof vi.fn>).mockResolvedValue({
      inApp: true,
      email: false,
      whatsapp: true,
      sms: true,
    })

    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'payment.received',
      title: 'Payment received',
      body: '$100',
    })

    const sendMock = inngest.send as ReturnType<typeof vi.fn>
    const names = sendMock.mock.calls.map(([evt]) =>
      String((evt as { name?: string })?.name ?? ''),
    )
    expect(names.some((n) => n.includes('whatsapp'))).toBe(true)
    expect(names.some((n) => n.includes('sms'))).toBe(true)
  })

  it('a throwing WhatsApp/SMS send does NOT block the in-app insert and notify() still returns', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { inngest } = await import('@/lib/inngest/client')
    const svc = makeServiceClient({ insertSingle: { data: { id: 'notif_inapp' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(resolveChannels as ReturnType<typeof vi.fn>).mockResolvedValue({
      inApp: true,
      email: false,
      whatsapp: true,
      sms: true,
    })
    // The async whatsapp/sms dispatch path rejects.
    ;(inngest.send as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('send failed'))

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'payment.received',
      title: 'Payment received',
      body: '$100',
    })

    // In-app insert STILL ran despite the throwing channel sends.
    expect(svc.__from.insert).toHaveBeenCalled()
    expect(result).toHaveProperty('ok')
    warn.mockRestore()
  })
})
