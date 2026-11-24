import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationChannelSendPayload } from '@/lib/inngest/events'

const mocks = vi.hoisted(() => ({
  assertWritable: vi.fn(),
  from: vi.fn(),
  lastInbound: vi.fn(),
  notifyOps: vi.fn(),
  revalidateSender: vi.fn(),
  rpc: vi.fn(),
  resolveChannels: vi.fn(),
  sendSms: vi.fn(),
  sendWhatsApp: vi.fn(),
}))

type StepResult = { ok: boolean; error?: string; skipped?: string; mode?: string }
type Handler = (ctx: {
  event: { id?: string; data: NotificationChannelSendPayload }
  step: { run: (id: string, fn: () => Promise<StepResult>) => Promise<StepResult> }
  attempt: number
}) => Promise<StepResult>

vi.mock('@/lib/inngest/client', () => ({ inngest: { createFunction: (_options: unknown, handler: Handler) => ({ handler }) } }))
vi.mock('@/lib/demo/guard', () => ({ assertCompanyWritable: mocks.assertWritable }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock('@/lib/whatsapp/owner-send', () => ({ getOwnerLastInboundAt: mocks.lastInbound, sendOwnerWhatsApp: mocks.sendWhatsApp }))
vi.mock('@/lib/whatsapp/account-registry', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/whatsapp/account-registry')>(),
  revalidateWhatsAppSender: mocks.revalidateSender,
}))
vi.mock('@/lib/sms/client', () => ({ sendSms: mocks.sendSms }))
vi.mock('@/lib/notifications/preferences', () => ({ resolveChannels: mocks.resolveChannels }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: mocks.notifyOps }))

import { notificationChannelSend } from '@/lib/inngest/functions/notification-channel-send'

const queuedWhatsApp = {
  channel: 'whatsapp', companyId: 'company-1', userId: 'user-1', to: '+15551234567', eventType: 'payment.received',
  templateName: 'owner_update', languageCode: 'en_US', variables: ['Payment', 'Payment received'],
} as const
const whatsapp: NotificationChannelSendPayload = { ...queuedWhatsApp, variables: [...queuedWhatsApp.variables] }
const sms: NotificationChannelSendPayload = {
  channel: 'sms', companyId: queuedWhatsApp.companyId, userId: queuedWhatsApp.userId, to: queuedWhatsApp.to,
  eventType: queuedWhatsApp.eventType, body: 'Payment received',
}

const claims = new Map<string, string>()
let finalizeError: { code: string } | null

function claimQuery() {
  let eventId: string
  let channel: string
  let patch: string | undefined
  let remove = false
  const key = () => `${eventId}:${channel}`
  const builder = {
    insert: ({ event_id, channel: newChannel }: { event_id: string; channel: string }) => {
      const insertKey = `${event_id}:${newChannel}`
      if (claims.has(insertKey)) return { error: { code: '23505' } }
      claims.set(insertKey, 'sending')
      return { error: null }
    },
    select: () => builder,
    maybeSingle: () => ({ data: claims.has(key()) ? { status: claims.get(key()) } : null, error: null }),
    update: ({ status }: { status: string }) => { patch = status; return builder },
    delete: () => { remove = true; return builder },
    eq: (field: string, value: string) => {
      if (field === 'event_id') eventId = value
      if (field === 'channel') channel = value
      return builder
    },
    then: (resolve: (result: { error: { code: string } | null }) => void) => {
      if (patch && finalizeError) return resolve({ error: finalizeError })
      if (patch) claims.set(key(), patch)
      if (remove) claims.delete(key())
      resolve({ error: null })
    },
  }
  return builder
}

function run(data: NotificationChannelSendPayload = whatsapp, attempt = 0) {
  const { handler } = notificationChannelSend as unknown as { handler: Handler }
  return handler({ event: { id: 'event-1', data }, step: { run: async (_id, fn) => fn() }, attempt })
}

beforeEach(() => {
  vi.resetAllMocks()
  claims.clear()
  finalizeError = null
  mocks.from.mockImplementation(claimQuery)
  mocks.assertWritable.mockResolvedValue(null)
  mocks.lastInbound.mockResolvedValue(null)
  mocks.resolveChannels.mockResolvedValue({ whatsapp: true, sms: true })
  mocks.revalidateSender.mockResolvedValue(true)
  mocks.rpc.mockResolvedValue({ data: true, error: null })
  mocks.sendWhatsApp.mockResolvedValue({ ok: true, mode: 'template', wamid: 'wamid.1' })
  mocks.sendSms.mockResolvedValue({ ok: true, sid: 'sm_1' })
})

describe('notification channel send', () => {
  it('drops WhatsApp content when queued sender authority changed', async () => {
    mocks.revalidateSender.mockResolvedValue(false)

    await expect(run(whatsapp)).resolves.toMatchObject({ skipped: 'recipient_authority_changed' })
    expect(mocks.revalidateSender).toHaveBeenCalledWith(
      { companyId: whatsapp.companyId, userId: whatsapp.userId, phoneE164: whatsapp.to }, { throwOnError: true },
    )
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled()
    expect(mocks.sendSms).not.toHaveBeenCalled()
    expect(claims.size).toBe(0)
  })

  it('sends SMS to an eligible verified member without a WhatsApp sender or configuration', async () => {
    mocks.revalidateSender.mockResolvedValue(false)

    await expect(run(sms)).resolves.toMatchObject({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('whatsapp_linked_identity_is_current', {
      p_company_id: sms.companyId, p_user_id: sms.userId, p_phone_e164: sms.to,
    })
    expect(mocks.revalidateSender).not.toHaveBeenCalled()
    expect(mocks.sendSms).toHaveBeenCalledWith(sms.to, sms.body, expect.objectContaining({ companyId: sms.companyId }))
  })

  it.each([
    { change: 'membership was removed', member: false, currentPhone: sms.to },
    { change: 'the verified phone changed', member: true, currentPhone: '+15555550100' },
  ])('drops queued SMS content when $change', async ({ member, currentPhone }) => {
    mocks.rpc.mockImplementation(async (_name, params) => ({
      data: member && params.p_phone_e164 === currentPhone,
      error: null,
    }))

    await expect(run(sms)).resolves.toMatchObject({ skipped: 'recipient_authority_changed' })
    expect(mocks.sendSms).not.toHaveBeenCalled()
    expect(claims.size).toBe(0)
  })

  it('retries an SMS authority lookup failure before claiming or sending', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'lookup timeout' } })

    await expect(run(sms)).rejects.toThrow('linked identity lookup failed')
    expect(mocks.sendSms).not.toHaveBeenCalled()
    expect(claims.size).toBe(0)
  })

  it('resolves opt-in and category preferences at send time, without an override', async () => {
    mocks.resolveChannels.mockResolvedValue({ sms: true, whatsapp: false })

    await expect(run()).resolves.toMatchObject({ skipped: 'channel_disabled' })
    expect(mocks.resolveChannels).toHaveBeenCalledWith(
      'payment.received', 'user-1', undefined, { throwOnReadError: true },
    )
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled()
  })

  it('retries a preference read failure before claiming or sending', async () => {
    mocks.resolveChannels.mockRejectedValue(Error('prefs lookup failure'))
    await expect(run()).rejects.toThrow('prefs lookup failure')
    expect(claims.size).toBe(0)
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled()
  })

  it('retries a strict authority lookup failure before claiming or sending', async () => {
    mocks.revalidateSender.mockRejectedValue(Error('lookup failure'))
    await expect(run()).rejects.toThrow('lookup failure')
    expect(claims.size).toBe(0)
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled()
  })

  it('retries documented provider rejections and rechecks authority before the next attempt', async () => {
    mocks.sendWhatsApp.mockResolvedValueOnce({ ok: false, error: 'send_failed', deliveryFailure: 'retryable' })
    await expect(run()).rejects.toThrow('provider requested a retry')
    expect(claims.size).toBe(0)

    mocks.revalidateSender.mockResolvedValueOnce(false)
    await expect(run(whatsapp, 1)).resolves.toMatchObject({ skipped: 'recipient_authority_changed' })
    expect(mocks.sendWhatsApp).toHaveBeenCalledTimes(1)
  })

  it('returns a permanent provider rejection without retrying the POST', async () => {
    mocks.sendSms.mockResolvedValue({ ok: false, error: 'Invalid recipient', deliveryFailure: 'permanent' })
    await expect(run(sms)).resolves.toMatchObject({ error: 'provider_rejected' })
    await expect(run(sms)).resolves.toMatchObject({ error: 'provider_rejected' })
    expect(mocks.sendSms).toHaveBeenCalledTimes(1)
    expect(claims.get('event-1:sms')).toBe('rejected')
  })

  it('flags an ambiguous provider outcome and keeps the durable claim', async () => {
    mocks.sendWhatsApp.mockRejectedValue(Error('connection closed'))
    await expect(run()).resolves.toMatchObject({ error: 'delivery_needs_review' })
    await expect(run()).resolves.toMatchObject({ error: 'delivery_needs_review' })
    expect(mocks.sendWhatsApp).toHaveBeenCalledTimes(1)
    expect(claims.get('event-1:whatsapp')).toBe('needs_review')
    expect(mocks.notifyOps).toHaveBeenCalledWith(expect.objectContaining({ kind: 'notification_delivery_uncertain' }))
  })

  it('prevents another provider send after acceptance even if claim finalization fails', async () => {
    finalizeError = { code: 'DB_FAILED' }
    await expect(run()).rejects.toThrow('finalize')
    finalizeError = null
    mocks.revalidateSender.mockResolvedValue(false)
    await expect(run(whatsapp, 1)).resolves.toMatchObject({ error: 'delivery_needs_review' })
    expect(mocks.sendWhatsApp).toHaveBeenCalledTimes(1)
    expect(claims.get('event-1:whatsapp')).toBe('needs_review')
  })

  it('deduplicates successful sends using the stable event ID', async () => {
    await expect(run()).resolves.toMatchObject({ ok: true, mode: 'template' })
    await expect(run()).resolves.toMatchObject({ ok: true, skipped: 'already_sent' })
    expect(mocks.sendWhatsApp).toHaveBeenCalledTimes(1)
  })
})
