import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Phase 2b: write side of the `messaging_cost_events` ledger (one row per message
 * we send on a customer's behalf). Never throws: recording a cost must never
 * break or delay the send path it hangs off (same posture as record-ai-cost.ts).
 *
 * This file only RECORDS. Pricing a row (rates from billing_config) lives in
 * lib/billing/messaging-cost.ts and the credit debit in the hourly job
 * (lib/inngest/functions/debit-messaging-costs.ts).
 */

export type MessagingChannel = 'whatsapp' | 'sms' | 'email'
export type MessagingProvider = 'meta' | 'twilio' | 'resend'
export type MessagingStatus = 'sent' | 'delivered' | 'failed'

/**
 * Why a message was sent. `billable` defaults come from the call site: the
 * welcome sequence, the unknown-sender reply, OTP/login codes and ops alerts are
 * PLATFORM costs (recorded, never passed to a customer).
 */
export type MessagingPurpose =
  | 'bot_reply'
  | 'owner_notification'
  | 'estimate_delivery'
  | 'customer_message'
  | 'welcome'
  | 'unknown_sender'
  | 'otp'
  | 'ops'
  | 'unclassified'

/** Per-send attribution threaded through the senders (companyId null = platform send). */
export type MessagingMeta = {
  companyId?: string | null
  purpose: MessagingPurpose
  billable?: boolean
}

export type MessagingEventInput = {
  companyId: string | null
  channel: MessagingChannel
  provider: MessagingProvider
  providerMessageId: string | null
  purpose: MessagingPurpose
  billable: boolean
  category?: string | null
  market?: string | null
  units?: number
  costUsd?: number | null
  status?: MessagingStatus
}

/** Purposes that are platform costs and are never billed, whatever the caller passes. */
const NON_BILLABLE_PURPOSES: ReadonlySet<string> = new Set(['welcome', 'unknown_sender', 'otp', 'ops'])

/** Resolve billable: platform purposes are always false; a null company can never be billed. */
export function resolveBillable(meta: Pick<MessagingMeta, 'companyId' | 'purpose' | 'billable'>): boolean {
  if (NON_BILLABLE_PURPOSES.has(meta.purpose)) return false
  if (!meta.companyId) return false
  return meta.billable ?? true
}

/**
 * Destination market from an E.164 phone (with or without '+'): calling code 1 ->
 * 'US' (CA shares +1 and the default rates are identical), 55 -> 'BR', else 'default'.
 */
export function marketFromPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/[^\d]/g, '')
  if (digits.startsWith('55')) return 'BR'
  if (digits.startsWith('1')) return 'US'
  return 'default'
}

// GSM 03.38 basic set + extension table (extension chars cost 2 septets).
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
const GSM_EXTENDED = '^{}\[~]|€\f'

/**
 * SMS segments for a body when the provider did not report `num_segments`.
 * GSM-7: 160 single / 153 per part when concatenated; UCS-2 (any non-GSM char,
 * e.g. an emoji or most accented capitals): 70 / 67.
 */
export function estimateSmsSegments(body: string): number {
  if (!body) return 1
  let septets = 0
  let gsm = true
  for (const ch of body) {
    if (GSM_BASIC.includes(ch)) septets += 1
    else if (GSM_EXTENDED.includes(ch)) septets += 2
    else {
      gsm = false
      break
    }
  }
  if (gsm) return septets <= 160 ? 1 : Math.ceil(septets / 153)
  const units = body.length // UTF-16 code units, which is what UCS-2 segmentation counts
  return units <= 70 ? 1 : Math.ceil(units / 67)
}

/** Insert one cost row. Best-effort: logs and resolves false on any failure; a duplicate provider id is a no-op. */
export async function recordMessagingEvent(input: MessagingEventInput): Promise<boolean> {
  try {
    const svc = createServiceClient()
    if (!svc) return false
    const { error } = await svc.from('messaging_cost_events').insert({
      company_id: input.companyId,
      channel: input.channel,
      provider: input.provider,
      provider_message_id: input.providerMessageId,
      purpose: input.purpose,
      billable: input.billable,
      category: input.category ?? null,
      market: input.market ?? null,
      units: input.units ?? 1,
      cost_usd: input.costUsd ?? null,
      status: input.status ?? 'sent',
    })
    if (error) {
      // 23505 = this provider message was already recorded (retry): fine.
      if (error.code !== '23505') {
        console.warn('[messaging-cost] insert failed:', error.message)
        return false
      }
    }
    return true
  } catch (err) {
    console.warn('[messaging-cost] insert threw:', err instanceof Error ? err.message : String(err))
    return false
  }
}
