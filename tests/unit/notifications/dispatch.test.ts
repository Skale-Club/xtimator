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
  // Phase 104.3 wiring: the WhatsApp dispatch branch resolves via the async
  // DB-backed variant (approved DB row → template, static-map fallback).
  getApprovedTemplateForEvent: vi.fn().mockResolvedValue({
    templateName: 'owner_billing_alert',
    languageCode: 'en_US',
    variables: () => ['Acme', '$100'],
  }),
}))

// Phase 172 plan 03 (TMPL-06) — the copyContext resolution seam. Mocked here
// so the new describe block below can assert notify()'s wiring in isolation
// from resolveNotificationCopy's own (separately-tested) fallback logic.
vi.mock('@/lib/notifications/template-resolver', () => ({
  resolveNotificationCopy: vi.fn(),
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

/**
 * Phase 104.3 wiring — dispatch resolves the WhatsApp template via the async
 * DB-backed `getApprovedTemplateForEvent` (admin-approved DB row wins, static-map
 * fallback) instead of the sync static-only `getTemplateForEvent`.
 *
 * The DB-wins-vs-fallback logic itself is covered against the real resolver in
 * `whatsapp-registry.test.ts`; here we assert the DISPATCH wiring: whatever the
 * resolver returns flows into the Inngest send, and a resolver failure degrades
 * the branch gracefully without ever breaking the in-app insert.
 */
describe('lib/notifications/dispatch — DB-backed WhatsApp template resolver (NOTIF-03 / 104.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the resolved (admin-approved) template name + language + vars in the WhatsApp send', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { inngest } = await import('@/lib/inngest/client')
    const svc = makeServiceClient({})
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(resolveChannels as ReturnType<typeof vi.fn>).mockResolvedValue({
      inApp: true,
      email: false,
      whatsapp: true,
      sms: false,
    })
    // Simulate an admin-approved DB row resolving to a non-static template.
    ;(getApprovedTemplateForEvent as ReturnType<typeof vi.fn>).mockResolvedValue({
      templateName: 'db_approved_owner_estimate',
      languageCode: 'pt_BR',
      variables: (p: { title: string; body: string }) => [p.title, p.body],
    })

    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'estimate.accepted',
      title: 'Estimate accepted',
      body: 'Acme accepted your estimate',
    })

    expect(getApprovedTemplateForEvent).toHaveBeenCalledWith('estimate.accepted')
    const sendMock = inngest.send as ReturnType<typeof vi.fn>
    const whatsappCall = sendMock.mock.calls.find(([evt]) =>
      String((evt as { name?: string })?.name ?? '').includes('whatsapp'),
    )
    expect(whatsappCall).toBeDefined()
    const data = (whatsappCall?.[0] as { data?: Record<string, unknown> })?.data
    expect(data?.templateName).toBe('db_approved_owner_estimate')
    expect(data?.languageCode).toBe('pt_BR')
    expect(data?.variables).toEqual(['Estimate accepted', 'Acme accepted your estimate'])
  })

  it('sends nothing over WhatsApp when the resolver yields no template (static fallback also empty)', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { inngest } = await import('@/lib/inngest/client')
    const svc = makeServiceClient({})
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(resolveChannels as ReturnType<typeof vi.fn>).mockResolvedValue({
      inApp: true,
      email: false,
      whatsapp: true,
      sms: false,
    })
    ;(getApprovedTemplateForEvent as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'estimate.viewed',
      title: 't',
      body: 'b',
    })

    const sendMock = inngest.send as ReturnType<typeof vi.fn>
    const whatsappCall = sendMock.mock.calls.find(([evt]) =>
      String((evt as { name?: string })?.name ?? '').includes('whatsapp'),
    )
    expect(whatsappCall).toBeUndefined()
  })

  it('a rejecting resolver degrades gracefully — in-app insert still ran, notify() returns, no throw, no WhatsApp send', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveChannels } = await import('@/lib/notifications/preferences')
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const { inngest } = await import('@/lib/inngest/client')
    const svc = makeServiceClient({ insertSingle: { data: { id: 'notif_inapp' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(resolveChannels as ReturnType<typeof vi.fn>).mockResolvedValue({
      inApp: true,
      email: false,
      whatsapp: true,
      sms: false,
    })
    ;(getApprovedTemplateForEvent as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('registry down'),
    )

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'payment.received',
      title: 'Payment received',
      body: '$100',
    })

    // The in-app insert ran BEFORE the WhatsApp branch and is unaffected.
    expect(svc.__from.insert).toHaveBeenCalled()
    expect(result.ok).toBe(true)
    expect(result.notificationId).toBe('notif_inapp')
    // No WhatsApp send fired because template resolution threw (swallowed).
    const sendMock = inngest.send as ReturnType<typeof vi.fn>
    const whatsappCall = sendMock.mock.calls.find(([evt]) =>
      String((evt as { name?: string })?.name ?? '').includes('whatsapp'),
    )
    expect(whatsappCall).toBeUndefined()
    warn.mockRestore()
  })
})

/**
 * Phase 172 plan 03 (TMPL-06) — the optional `copyContext` seam on notify().
 *
 * Additive-only contract: omitted (every existing call site today) means
 * `resolveNotificationCopy` is never invoked and notify() is byte-identical
 * to pre-Phase-172 behavior. Provided, it drives the in_app insert's
 * title/body. A rejecting resolver is defense-in-depth-guarded — notify()
 * falls back to the caller-supplied title/body and never throws.
 */
describe('lib/notifications/dispatch — copyContext seam (TMPL-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('WITHOUT copyContext: resolveNotificationCopy is never called, insert uses params.title/body verbatim', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const svc = makeServiceClient({ insertSingle: { data: { id: 'notif_1' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'estimate.viewed',
      title: 'Estimate viewed',
      body: 'Acme Co viewed your estimate',
    })

    expect(resolveNotificationCopy).not.toHaveBeenCalled()
    const insertCall = (svc.__from.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(insertCall).toMatchObject({
      title: 'Estimate viewed',
      body: 'Acme Co viewed your estimate',
    })
  })

  it('WITH copyContext: resolveNotificationCopy is called with (tenant, eventType, in_app, copyContext) and its return drives the insert', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const svc = makeServiceClient({ insertSingle: { data: { id: 'notif_2' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(resolveNotificationCopy as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Resolved title',
      body: 'Resolved body',
    })

    const copyContext = { clientName: 'Acme Co', estimateNumber: 'EST-1' }
    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'estimate.viewed',
      title: 'Caller title',
      body: 'Caller body',
      copyContext,
    })

    expect(resolveNotificationCopy).toHaveBeenCalledWith(
      'tenant',
      'estimate.viewed',
      'in_app',
      copyContext,
    )
    const insertCall = (svc.__from.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(insertCall).toMatchObject({ title: 'Resolved title', body: 'Resolved body' })
  })

  it('WITH copyContext, resolver REJECTS: insert falls back to original params.title/body, notify() returns ok:true, never throws', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const svc = makeServiceClient({ insertSingle: { data: { id: 'notif_3' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(resolveNotificationCopy as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('resolver exploded'),
    )

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'estimate.viewed',
      title: 'Caller title',
      body: 'Caller body',
      copyContext: { clientName: 'Acme Co' },
    })

    expect(result.ok).toBe(true)
    const insertCall = (svc.__from.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(insertCall).toMatchObject({ title: 'Caller title', body: 'Caller body' })
    warn.mockRestore()
  })

  it('WITH a SPARSE copyContext: buildFullCopyContext enriches ctx with copy.ts defaults BEFORE resolution (carry-forward a, now load-bearing)', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const svc = makeServiceClient({ insertSingle: { data: { id: 'notif_sparse' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(resolveNotificationCopy as ReturnType<typeof vi.fn>).mockImplementation(
      async () => ({ title: 'x', body: 'y' }),
    )

    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'payment.received',
      title: 'Caller title',
      body: 'Caller body',
      // Sparse: amountUSD/projectName intentionally omitted/undefined.
      copyContext: { amountUSD: undefined, projectName: undefined },
    })

    expect(resolveNotificationCopy).toHaveBeenCalledTimes(1)
    const call = (resolveNotificationCopy as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call?.[2]).toBe('in_app')
    // The ctx actually received has copy.ts's defaults filled in — NOT undefined.
    expect(call?.[3]).toMatchObject({ amountUSD: 'A payment', projectName: 'a project' })
  })

  it('WITH copyContext + channels.email:true + userId: resolves a SECOND (email-channel) copy and stashes metadata.email_copy', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const svc = makeServiceClient({ insertSingle: { data: { id: 'notif_email' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(resolveNotificationCopy as ReturnType<typeof vi.fn>).mockImplementation(
      async (_scope: string, _eventType: string, channel: string) => ({
        title: channel === 'email' ? 'Email subject' : 'In-app title',
        body: channel === 'email' ? 'Email body html' : 'In-app body',
      }),
    )

    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'estimate.viewed',
      title: 'Caller title',
      body: 'Caller body',
      copyContext: { clientName: 'Acme Co' },
      channels: { inApp: true, email: true },
    })

    const calls = (resolveNotificationCopy as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c) => c[2] === 'email')).toBe(true)
    expect(calls).toHaveLength(2) // in_app + email
    const insertCall = (svc.__from.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(insertCall.metadata).toMatchObject({
      email_copy: { subject: 'Email subject', body: 'Email body html' },
    })
  })

  it('WITH copyContext but channels.email:false: resolveNotificationCopy is NEVER called with "email", no metadata.email_copy key', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const svc = makeServiceClient({ insertSingle: { data: { id: 'notif_noemail' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(resolveNotificationCopy as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'In-app title',
      body: 'In-app body',
    })

    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'estimate.viewed',
      title: 'Caller title',
      body: 'Caller body',
      copyContext: { clientName: 'Acme Co' },
      channels: { inApp: true, email: false },
    })

    const calls = (resolveNotificationCopy as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c) => c[2] === 'email')).toBe(false)
    const insertCall = (svc.__from.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(insertCall.metadata).not.toHaveProperty('email_copy')
  })

  it('WITH copyContext + channels.sms:true + resolvable phone: resolves a DISTINCT sms-channel copy for the sms body', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const { inngest } = await import('@/lib/inngest/client')
    const svc = makeServiceClient({ insertSingle: { data: { id: 'notif_sms' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(resolveNotificationCopy as ReturnType<typeof vi.fn>).mockImplementation(
      async (_scope: string, _eventType: string, channel: string) => ({
        title: channel === 'sms' ? 'SMS title' : 'Other title',
        body: channel === 'sms' ? 'SMS body' : 'Other body',
      }),
    )

    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'payment.received',
      title: 'Caller title',
      body: 'Caller body',
      copyContext: { amountUSD: '$100', projectName: 'Kitchen remodel' },
      channels: { inApp: true, sms: true },
    })

    const calls = (resolveNotificationCopy as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c) => c[2] === 'sms')).toBe(true)
    const sendMock = inngest.send as ReturnType<typeof vi.fn>
    const smsCall = sendMock.mock.calls.find(([evt]) =>
      String((evt as { name?: string })?.name ?? '').includes('sms'),
    )
    expect(smsCall).toBeDefined()
    const data = (smsCall?.[0] as { data?: Record<string, unknown> })?.data
    expect(data?.body).toBe('SMS title: SMS body')
  })

  it('WITH copyContext + channels.sms:true, sms-channel resolver REJECTS: falls back to today\'s exact `${resolvedTitle}: ${resolvedBody}` format', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const { inngest } = await import('@/lib/inngest/client')
    const svc = makeServiceClient({ insertSingle: { data: { id: 'notif_sms_fallback' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(resolveNotificationCopy as ReturnType<typeof vi.fn>).mockImplementation(
      async (_scope: string, _eventType: string, channel: string) => {
        if (channel === 'sms') throw new Error('sms resolver exploded')
        return { title: 'In-app resolved title', body: 'In-app resolved body' }
      },
    )

    await notify({
      companyId: 'co_1',
      userId: 'user_1',
      eventType: 'payment.received',
      title: 'Caller title',
      body: 'Caller body',
      copyContext: { amountUSD: '$100', projectName: 'Kitchen remodel' },
      channels: { inApp: true, sms: true },
    })

    const sendMock = inngest.send as ReturnType<typeof vi.fn>
    const smsCall = sendMock.mock.calls.find(([evt]) =>
      String((evt as { name?: string })?.name ?? '').includes('sms'),
    )
    expect(smsCall).toBeDefined()
    const data = (smsCall?.[0] as { data?: Record<string, unknown> })?.data
    expect(data?.body).toBe('In-app resolved title: In-app resolved body')
  })
})
