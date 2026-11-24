/** Async delivery of paid notification channels, subject to current recipient authority. */
import { inngest } from '@/lib/inngest/client'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { requireServiceClient } from '@/lib/supabase/service'
import { getOwnerLastInboundAt, sendOwnerWhatsApp } from '@/lib/whatsapp/owner-send'
import {
  isCurrentWhatsAppLinkedIdentity,
  normalizeWhatsAppPhone,
  revalidateWhatsAppSender,
} from '@/lib/whatsapp/account-registry'
import { isWhatsAppOutboundBlocked } from '@/lib/whatsapp/outbound-guard'
import { sendSms } from '@/lib/sms/client'
import { EVENT_CATEGORIES, type EventType } from '@/lib/notifications/event-types'
import { resolveChannels } from '@/lib/notifications/preferences'
import { notifyOps } from '@/lib/observability/ops-alert'
import {
  EVENT_NOTIFICATION_WHATSAPP_SEND,
  EVENT_NOTIFICATION_SMS_SEND,
  type NotificationChannelSendPayload,
} from '@/lib/inngest/events'

const CLAIMS_TABLE = 'notification_channel_send_claims'

type DeliveryStatus = 'sent' | 'rejected' | 'needs_review' | 'retryable'
type Delivery = {
  status: DeliveryStatus
  mode?: 'freeform' | 'template'
  sid?: string
}

async function deliverNotification(
  data: NotificationChannelSendPayload,
  to: string,
  lastInboundAt: string | null,
): Promise<Delivery> {
  const meta = { companyId: data.companyId, purpose: 'owner_notification', billable: true } as const
  if (data.channel === 'whatsapp') {
    const sent = await sendOwnerWhatsApp({
      to,
      companyId: data.companyId,
      text: data.title ? `${data.title}\n${data.body ?? ''}`.trim() : data.variables.join('\n'),
      template: {
        name: data.templateName,
        languageCode: data.languageCode,
        bodyVariables: data.variables,
      },
      meta,
      lastInboundAt,
    })
    if (sent.ok) return sent.wamid ? { status: 'sent', mode: sent.mode } : { status: 'needs_review' }
    if (sent.error === 'outside_window_no_template' || sent.deliveryFailure === 'permanent') {
      return { status: 'rejected' }
    }
    return { status: sent.deliveryFailure === 'retryable' ? 'retryable' : 'needs_review' }
  }

  const result = await sendSms(to, data.body, meta)
  if (result.ok) return result.sid ? { status: 'sent', sid: result.sid } : { status: 'needs_review' }
  if (result.deliveryFailure === 'permanent') return { status: 'rejected' }
  return { status: result.deliveryFailure === 'retryable' ? 'retryable' : 'needs_review' }
}

async function flagAmbiguousDelivery(eventId: string, channel: string) {
  console.warn('[notification-channel-send] review the provider outcome before resending', { eventId, channel })
  await notifyOps({
    kind: 'notification_delivery_uncertain',
    title: 'Notification delivery needs review',
    message: 'Check the provider send history before resending this notification.',
    dedupeKey: `notification_delivery_uncertain:${channel}:${eventId}`,
    fields: [['Inngest event ID', eventId], ['Channel', channel]],
  })
}

async function readPriorClaim(
  svc: ReturnType<typeof requireServiceClient>,
  eventId: string,
  channel: NotificationChannelSendPayload['channel'],
  isRetry: boolean,
) {
  const { data, error } = await svc.from(CLAIMS_TABLE).select('status')
    .eq('event_id', eventId).eq('channel', channel).maybeSingle()
  if (error) throw new Error('Could not read notification delivery claim')
  if (!data) return null
  if (data.status === 'sent') return { ok: true, channel, skipped: 'already_sent' }
  if (data.status === 'rejected') return { ok: false, channel, error: 'provider_rejected' }
  if (data.status === 'sending') {
    if (!isRetry) return { ok: true, channel, skipped: 'already_claimed' }
    const { error: updateError } = await svc.from(CLAIMS_TABLE).update({ status: 'needs_review' })
      .eq('event_id', eventId).eq('channel', channel).eq('status', 'sending')
    if (updateError) throw new Error('Could not flag interrupted notification delivery')
  }
  await flagAmbiguousDelivery(eventId, channel)
  return { ok: false, channel, error: 'delivery_needs_review' }
}

export const notificationChannelSend = inngest.createFunction(
  {
    id: 'notification-channel-send',
    retries: 3,
    concurrency: { key: 'event.id', limit: 1 },
    triggers: [
      { event: EVENT_NOTIFICATION_WHATSAPP_SEND },
      { event: EVENT_NOTIFICATION_SMS_SEND },
    ],
  },
  async ({ event, step, attempt }) => {
    const data = event.data as NotificationChannelSendPayload
    const channel = data.channel
    if (channel !== 'whatsapp' && channel !== 'sms') return { ok: false, error: 'unknown_channel' }
    if (!event.id || !data.userId || !data.companyId || !Object.hasOwn(EVENT_CATEGORIES, data.eventType)) {
      return { ok: false, channel, error: 'invalid_event' }
    }
    const eventId = event.id
    const to = typeof data.to === 'string' ? normalizeWhatsAppPhone(data.to) : null
    if (!to) return { ok: false, channel, error: 'invalid_destination' }
    const denied = await assertCompanyWritable(data.companyId)
    if (denied) return { ok: false, channel, error: 'demo_readonly' }

    // The read and send live in the same step so every actual attempt reads fresh
    // state, including after a retryable provider response.
    return step.run(channel === 'whatsapp' ? 'send-whatsapp-owner' : 'send-sms', async () => {
      const svc = requireServiceClient()
      const isRetry = attempt > 0
      if (isRetry) {
        const prior = await readPriorClaim(svc, eventId, channel, isRetry)
        if (prior) return prior
      }

      if (channel === 'whatsapp' && isWhatsAppOutboundBlocked()) {
        return { ok: true, channel, skipped: 'outbound_blocked' }
      }

      const channels = await resolveChannels(data.eventType as EventType, data.userId, undefined, { throwOnReadError: true })
      if (!channels[channel]) return { ok: true, channel, skipped: 'channel_disabled' }

      const lastInboundAt = channel === 'whatsapp' ? await getOwnerLastInboundAt(svc, data.companyId, to) : null
      const currentRecipient = channel === 'whatsapp'
        ? await revalidateWhatsAppSender(
          { companyId: data.companyId, userId: data.userId, phoneE164: to },
          { throwOnError: true },
        )
        : await isCurrentWhatsAppLinkedIdentity(data.companyId, data.userId, to)
      if (!currentRecipient) return { ok: true, channel, skipped: 'recipient_authority_changed' }

      // The same event must not issue another POST after an uncertain provider
      // outcome or a crash before Inngest could save the step result.
      const { error: claimError } = await svc.from(CLAIMS_TABLE).insert({ event_id: eventId, channel })
      if (claimError?.code === '23505') {
        const prior = await readPriorClaim(svc, eventId, channel, isRetry)
        if (prior) return prior
        throw new Error('Notification delivery claim changed during lookup')
      }
      if (claimError) throw new Error('Could not claim notification delivery')

      let delivery: Delivery
      try {
        delivery = await deliverNotification(data, to, lastInboundAt)
      } catch {
        delivery = { status: 'needs_review' }
      }
      if (delivery.status === 'retryable') {
        const { error } = await svc.from(CLAIMS_TABLE).delete().eq('event_id', eventId).eq('channel', channel)
        if (error) throw new Error('Could not release rejected notification delivery claim')
        throw new Error(`Notification provider requested a retry (${channel})`)
      }

      const { error: finalizeError } = await svc.from(CLAIMS_TABLE).update({ status: delivery.status })
        .eq('event_id', eventId).eq('channel', channel)
      if (finalizeError) throw new Error('Could not finalize notification delivery claim')

      if (delivery.status === 'needs_review') {
        await flagAmbiguousDelivery(eventId, channel)
        return { ok: false, channel, error: 'delivery_needs_review' }
      }
      if (delivery.status === 'rejected') {
        console.warn('[notification-channel-send] provider rejected notification', { eventId, channel })
        return { ok: false, channel, error: 'provider_rejected' }
      }
      return { ok: true, channel, ...(delivery.mode && { mode: delivery.mode }), ...(delivery.sid && { sid: delivery.sid }) }
    })
  },
)
