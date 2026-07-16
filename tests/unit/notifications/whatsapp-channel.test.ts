import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * Phase 104 plan 00 — Wave-0 RED test for the WhatsApp dispatch branch (NOTIF-03).
 *
 * Extends the `notify()` contract: when the resolved channels enable `whatsapp`,
 * the owner phone resolves, and the event has a mapped template in the (not-yet-
 * existing) `@/lib/notifications/whatsapp-registry`, `notify()` dispatches a
 * WhatsApp template send async via Inngest (mirroring the email branch). Gating:
 * no phone OR no template → silent no-op. Best-effort: a throwing dispatch path
 * never makes `notify()` throw.
 *
 * RED form: `@/lib/notifications/owner-phone` + `@/lib/notifications/whatsapp-registry`
 * do not exist yet, and `resolveChannels` does not return whatsapp today. The lazy
 * `await import` keeps the file collectable; mocks are scoped + cleared in afterEach
 * so cross-suite forks runs don't leak.
 *
 * Owner: Wave 2 (104.2 — WhatsApp sender + registry + dispatch wiring).
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['evt_1'] }) },
}))

vi.mock('@/lib/notifications/preferences', () => ({
  resolveChannels: vi.fn().mockResolvedValue({
    inApp: false,
    email: false,
    whatsapp: true,
    sms: false,
  }),
}))

vi.mock('@/lib/notifications/owner-phone', () => ({
  resolveOwnerPhone: vi.fn().mockResolvedValue('+15551230000'),
}))

vi.mock('@/lib/notifications/whatsapp-registry', () => ({
  getTemplateForEvent: vi.fn().mockReturnValue({
    templateName: 'owner_billing_alert',
    languageCode: 'en_US',
    variables: () => ['Acme', '$100'],
  }),
  // Phase 104.3 wiring: dispatch resolves via the async DB-backed variant
  // (approved DB row → template, static-map fallback).
  getApprovedTemplateForEvent: vi.fn().mockResolvedValue({
    templateName: 'owner_billing_alert',
    languageCode: 'en_US',
    variables: () => ['Acme', '$100'],
  }),
}))

afterEach(() => {
  vi.clearAllMocks()
})

type SimpleResp<T = unknown> = { data: T; error: { message: string } | null }

function makeServiceClient(insertSingle?: SimpleResp<{ id: string } | null>) {
  const insertChain: Record<string, unknown> = {
    single: vi.fn().mockResolvedValue(insertSingle ?? { data: { id: 'notif_new' }, error: null }),
  }
  insertChain.select = vi.fn().mockReturnValue(insertChain)

  const dedupeChain: Record<string, unknown> = {
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  dedupeChain.gte = vi.fn().mockReturnValue(dedupeChain)
  dedupeChain.eq = vi.fn().mockReturnValue(dedupeChain)
  dedupeChain.contains = vi.fn().mockReturnValue(dedupeChain)
  dedupeChain.limit = vi.fn().mockReturnValue(dedupeChain)

  const fromTable = {
    insert: vi.fn().mockReturnValue(insertChain),
    select: vi.fn().mockReturnValue(dedupeChain),
  }
  return { from: vi.fn().mockReturnValue(fromTable), __from: fromTable }
}

const BILLING_EVENT = {
  companyId: 'co_1',
  userId: 'user_1',
  eventType: 'payment.received' as const,
  title: 'Payment received',
  body: '$100',
}

describe('lib/notifications/dispatch — WhatsApp branch (NOTIF-03 RED)', () => {
  it('dispatches a WhatsApp send via Inngest when channel+phone+template all present', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { inngest } = await import('@/lib/inngest/client')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeServiceClient())

    await notify(BILLING_EVENT)

    const sendMock = inngest.send as ReturnType<typeof vi.fn>
    const whatsappCall = sendMock.mock.calls.find(([evt]) =>
      String((evt as { name?: string })?.name ?? '').includes('whatsapp'),
    )
    expect(whatsappCall).toBeDefined()
    expect((whatsappCall?.[0] as { data?: { userId?: string } })?.data?.userId).toBe('user_1')
  })

  it('no-op when resolveOwnerPhone returns null (in-app/email path unaffected)', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { inngest } = await import('@/lib/inngest/client')
    const { resolveOwnerPhone } = await import('@/lib/notifications/owner-phone')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeServiceClient())
    ;(resolveOwnerPhone as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    await notify(BILLING_EVENT)

    const sendMock = inngest.send as ReturnType<typeof vi.fn>
    const whatsappCall = sendMock.mock.calls.find(([evt]) =>
      String((evt as { name?: string })?.name ?? '').includes('whatsapp'),
    )
    expect(whatsappCall).toBeUndefined()
  })

  it('no-op when getApprovedTemplateForEvent returns null (no template mapped)', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { inngest } = await import('@/lib/inngest/client')
    const { getApprovedTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeServiceClient())
    ;(getApprovedTemplateForEvent as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    await notify(BILLING_EVENT)

    const sendMock = inngest.send as ReturnType<typeof vi.fn>
    const whatsappCall = sendMock.mock.calls.find(([evt]) =>
      String((evt as { name?: string })?.name ?? '').includes('whatsapp'),
    )
    expect(whatsappCall).toBeUndefined()
  })

  it('best-effort: a throwing WhatsApp dispatch never makes notify() throw', async () => {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { inngest } = await import('@/lib/inngest/client')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeServiceClient())
    ;(inngest.send as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('inngest down'))

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await notify(BILLING_EVENT)
    expect(result).toHaveProperty('ok')
    warn.mockRestore()
  })
})
