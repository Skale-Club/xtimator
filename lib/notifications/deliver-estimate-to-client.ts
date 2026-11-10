import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertSendAllowed, type SendChannel } from '@/lib/notifications/customer-send-gate'
import { sendCustomerMessage } from '@/lib/notifications/customer-send'
import { shareLinkExpiryFromNow } from '@/lib/estimates/share-link'

/**
 * Deliver an estimate to the END CLIENT through the platform: email and/or SMS
 * only. The client never receives WhatsApp from the bot's number.
 *
 * Channel rules (the single place they live):
 *   - client has an email -> email
 *   - client has a phone  -> SMS (when the company has SMS delivery enabled)
 *   - both                -> both
 *   - neither             -> nothing is sent ('no_contact'); the caller tells the owner
 *
 * Every send goes through the gated, audited, cost-recorded funnel
 * (assertSendAllowed -> sendCustomerMessage, purpose 'customer_message'), in the
 * business's name: SMS opens with the business name, email is sent from
 * "{business} via Xtimator". Used by the WhatsApp bot's send_estimate tool; the
 * editor's Send routes keep their own explicit single-channel flows.
 *
 * Pass a SERVICE client (estimate_deliveries / estimate_activity writes).
 */

export interface ClientContacts {
  clientId: string
  clientName: string | null
  email: string | null
  phone: string | null
}

export interface ChannelOutcome {
  channel: SendChannel
  ok: boolean
  /** Machine reason when not ok: gate reason, 'sms_disabled', or the send error. */
  reason?: string
}

export type DeliverEstimateOutcome =
  | { status: 'sent'; sent: SendChannel[]; failed: ChannelOutcome[] }
  | { status: 'no_contact' }
  | { status: 'not_delivered'; failed: ChannelOutcome[] }

export async function getClientContacts(
  svc: SupabaseClient,
  companyId: string,
  clientId: string | null,
): Promise<ClientContacts | null> {
  if (!clientId) return null
  const { data } = await svc
    .from('clients')
    .select('name, email, phone')
    .eq('id', clientId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!data) return null
  const email = ((data.email as string | null) ?? '').trim()
  const phone = ((data.phone as string | null) ?? '').trim()
  return {
    clientId,
    clientName: (data.name as string | null) ?? null,
    email: email || null,
    phone: phone || null,
  }
}

export async function deliverEstimateToClient(params: {
  svc: SupabaseClient
  companyId: string
  estimateId: string
  projectId: string
  businessName: string
  shareUrl: string
  contacts: ClientContacts
}): Promise<DeliverEstimateOutcome> {
  const { svc, companyId, estimateId, projectId, businessName, shareUrl, contacts } = params

  const wanted: SendChannel[] = []
  if (contacts.email) wanted.push('email')
  if (contacts.phone) wanted.push('sms')
  if (wanted.length === 0) return { status: 'no_contact' }

  let smsEnabled = true
  if (contacts.phone) {
    const { data: company } = await svc
      .from('companies')
      .select('sms_delivery_enabled')
      .eq('id', companyId)
      .maybeSingle()
    smsEnabled = Boolean((company as { sms_delivery_enabled?: boolean | null } | null)?.sms_delivery_enabled)
  }

  const sent: SendChannel[] = []
  const failed: ChannelOutcome[] = []

  for (const channel of wanted) {
    if (channel === 'sms' && !smsEnabled) {
      failed.push({ channel, ok: false, reason: 'sms_disabled' })
      continue
    }

    const gate = await assertSendAllowed(companyId, contacts.clientId, channel)
    if (!gate.allowed || !gate.permit) {
      failed.push({ channel, ok: false, reason: gate.reason ?? 'gate_denied' })
      continue
    }

    const result = await sendCustomerMessage({
      permit: gate.permit,
      companyId,
      clientId: contacts.clientId,
      businessName,
      triggerSource: 'agentic-whatsapp',
      template: {
        eventType: 'estimate.sent',
        vars: { businessName, shareUrl, clientName: contacts.clientName ?? undefined },
      },
    })

    const now = new Date().toISOString()
    await svc.from('estimate_deliveries').insert({
      estimate_id: estimateId,
      company_id: companyId,
      channel,
      format: 'online_link',
      recipient_email: channel === 'email' ? contacts.email : null,
      recipient_phone: channel === 'sms' ? contacts.phone : null,
      provider: channel === 'email' ? 'resend' : 'twilio',
      provider_message_id: result.providerMessageId ?? null,
      status: result.ok ? 'sent' : 'failed',
      error_message: result.ok ? null : (result.error ?? 'Send failed'),
      sent_at: result.ok ? now : null,
    })

    if (result.ok) {
      sent.push(channel)
      await svc.from('estimate_activity').insert({
        project_id: projectId,
        company_id: companyId,
        estimate_id: estimateId,
        event_type: 'estimate_sent',
        metadata: { channel, via: 'whatsapp-bot' },
      })
    } else {
      failed.push({ channel, ok: false, reason: result.error ?? 'send_failed' })
    }
  }

  if (sent.length === 0) return { status: 'not_delivered', failed }

  // Same bookkeeping as the editor's Send: first send stamps sent_at, every send
  // refreshes the share-link expiry, the project moves to 'sent'.
  const now = new Date().toISOString()
  await svc.from('estimates').update({ sent_at: now }).eq('id', estimateId).is('sent_at', null)
  await svc.from('estimates').update({ share_expires_at: shareLinkExpiryFromNow() }).eq('id', estimateId)
  await svc.from('projects').update({ status: 'sent' }).eq('id', projectId)

  return { status: 'sent', sent, failed }
}

/** Human label for the owner confirmation: "email", "SMS" or "email and SMS". */
export function describeChannels(channels: SendChannel[]): string {
  const labels = channels.map((c) => (c === 'email' ? 'email' : 'SMS'))
  return labels.join(' and ')
}

/** One short reason per failed channel, for the owner. */
export function describeFailure(f: ChannelOutcome): string {
  const label = f.channel === 'email' ? 'email' : 'SMS'
  switch (f.reason) {
    case 'suppressed':
      return `the client opted out of ${label}`
    case 'no_consent':
      return 'the client has not agreed to SMS yet'
    case 'quiet_hours':
    case 'unresolvable_timezone':
      return 'SMS is outside the client\'s allowed hours, try again later'
    case 'sms_disabled':
      return 'SMS delivery is off for this company'
    default:
      return `the ${label} could not be delivered`
  }
}
