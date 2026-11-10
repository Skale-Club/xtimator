import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getBillingConfig,
  DEFAULT_MESSAGING_RATES,
  type MessagingRates,
  type WhatsAppCategory,
} from '@/lib/billing/billing-config'
import {
  estimateSmsSegments,
  marketFromPhone,
  recordMessagingEvent,
  resolveBillable,
  type MessagingMeta,
} from '@/lib/billing/messaging-events'

/**
 * Phase 2b: pricing of the messages we send (rates come from billing_config, so
 * the super-admin can retune them without a deploy) and the delivery-status
 * handling that turns a WhatsApp row from "sent, cost unknown" into "delivered,
 * cost known". The USD figures are PLACEHOLDERS (see DEFAULT_MESSAGING_RATES).
 */

function rateOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

/** USD for one DELIVERED WhatsApp message. Falls back market -> 'default' -> built-in defaults. */
export function whatsappCostUsd(
  rates: MessagingRates | undefined,
  market: string,
  category: string
): number {
  const cat = category as WhatsAppCategory
  const fromMarket = rateOrNull(rates?.whatsapp?.[market]?.[cat])
  if (fromMarket != null) return fromMarket
  const fromDefault = rateOrNull(rates?.whatsapp?.default?.[cat])
  if (fromDefault != null) return fromDefault
  return (
    rateOrNull(DEFAULT_MESSAGING_RATES.whatsapp.default[cat]) ??
    DEFAULT_MESSAGING_RATES.whatsapp.default.service ??
    0
  )
}

/** USD for an SMS: segments x the per-segment rate of the destination country. */
export function smsCostUsd(rates: MessagingRates | undefined, country: string, segments: number): number {
  const perSegment =
    rateOrNull(rates?.sms?.[country]) ??
    rateOrNull(rates?.sms?.default) ??
    DEFAULT_MESSAGING_RATES.sms.default
  return perSegment * Math.max(1, segments)
}

/** USD for one email. */
export function emailCostUsd(rates: MessagingRates | undefined): number {
  return rateOrNull(rates?.emailUsd) ?? DEFAULT_MESSAGING_RATES.emailUsd
}

/** Record an SMS we sent (call only after the provider accepted it). Never throws. */
export async function recordSmsSent(input: {
  to: string
  body: string
  sid?: string | null
  numSegments?: number | null
  meta: MessagingMeta
}): Promise<void> {
  try {
    const cfg = await getBillingConfig()
    const market = marketFromPhone(input.to)
    const segments =
      input.numSegments != null && input.numSegments > 0
        ? Math.round(input.numSegments)
        : estimateSmsSegments(input.body)
    await recordMessagingEvent({
      companyId: input.meta.companyId ?? null,
      channel: 'sms',
      provider: 'twilio',
      providerMessageId: input.sid ?? null,
      purpose: input.meta.purpose,
      billable: resolveBillable(input.meta),
      market,
      units: segments,
      costUsd: smsCostUsd(cfg.messagingRates, market, segments),
      status: 'sent',
    })
  } catch (err) {
    console.warn('[messaging-cost] recordSmsSent failed:', err instanceof Error ? err.message : String(err))
  }
}

/** Record an email we sent (call only after the provider accepted it). Never throws. */
export async function recordEmailSent(input: {
  id?: string | null
  meta: MessagingMeta
}): Promise<void> {
  try {
    const cfg = await getBillingConfig()
    await recordMessagingEvent({
      companyId: input.meta.companyId ?? null,
      channel: 'email',
      provider: 'resend',
      providerMessageId: input.id ?? null,
      purpose: input.meta.purpose,
      billable: resolveBillable(input.meta),
      costUsd: emailCostUsd(cfg.messagingRates),
      status: 'sent',
    })
  } catch (err) {
    console.warn('[messaging-cost] recordEmailSent failed:', err instanceof Error ? err.message : String(err))
  }
}

/** One entry of a Meta webhook statuses[] array. */
export type WhatsAppStatusEntry = {
  id: string
  status: string
  timestamp?: string
  recipient_id?: string
  pricing?: {
    billable?: boolean
    pricing_model?: string
    category?: string
    type?: string
  }
  errors?: Array<{ code?: number; title?: string; message?: string }>
}

const FREE_PRICING_TYPES: ReadonlySet<string> = new Set(['free_customer_service', 'free_entry_point'])

/**
 * Apply ONE status webhook entry. Idempotent: every transition is conditional on
 * the stored status still being what we expect, so a repeated webhook changes
 * nothing twice (and a late 'failed' never overwrites 'delivered').
 *
 *  - 'delivered' (or 'read' when the delivered webhook was missed): the row goes
 *    sent -> delivered and is priced from the pricing block Meta sends (cost 0
 *    when Meta says billable:false or the type is free_*; otherwise the rate for
 *    the recipient market x category; category falls back to the one recorded at
 *    send, else 'service').
 *  - 'failed': sent -> failed, cost 0.
 *  - 'sent' carrying a pricing block: only remembers the category.
 * whatsapp_messages.status (the inbox tick) follows monotonically.
 */
export async function applyWhatsAppStatus(entry: WhatsAppStatusEntry): Promise<void> {
  const svc = createServiceClient()
  if (!svc || !entry?.id) return
  const wamid = entry.id
  const status = entry.status

  // Inbox status (monotonic: sent < delivered < read; failed only from sent).
  try {
    const allowedFrom: Record<string, string[]> = {
      delivered: ['sent'],
      read: ['sent', 'delivered'],
      failed: ['sent'],
    }
    const from = allowedFrom[status]
    if (from) {
      await svc
        .from('whatsapp_messages')
        .update({
          status,
          ...(status === 'failed'
            ? { error_message: entry.errors?.[0]?.title ?? entry.errors?.[0]?.message ?? null }
            : {}),
        })
        .eq('wa_message_id', wamid)
        .in('status', from)
    }
  } catch (err) {
    console.warn('[messaging-cost] whatsapp_messages status update failed:', err instanceof Error ? err.message : String(err))
  }

  // Cost row.
  try {
    const { data: row } = await svc
      .from('messaging_cost_events')
      .select('id, status, category, market')
      .eq('provider', 'meta')
      .eq('provider_message_id', wamid)
      .maybeSingle()
    const current = row as { id: string; status: string; category: string | null; market: string | null } | null
    if (!current || current.status !== 'sent') return // unknown message, or already settled

    const category = entry.pricing?.category ?? current.category ?? null

    if (status === 'failed') {
      await svc
        .from('messaging_cost_events')
        .update({ status: 'failed', cost_usd: 0, ...(category ? { category } : {}) })
        .eq('id', current.id)
        .eq('status', 'sent')
      return
    }

    if (status === 'sent') {
      if (entry.pricing?.category && !current.category) {
        await svc
          .from('messaging_cost_events')
          .update({ category: entry.pricing.category })
          .eq('id', current.id)
          .eq('status', 'sent')
      }
      return
    }

    if (status !== 'delivered' && status !== 'read') return

    const market = entry.recipient_id ? marketFromPhone(entry.recipient_id) : (current.market ?? 'default')
    const free =
      entry.pricing?.billable === false ||
      (entry.pricing?.type != null && FREE_PRICING_TYPES.has(entry.pricing.type))
    let costUsd = 0
    if (!free) {
      const cfg = await getBillingConfig()
      costUsd = whatsappCostUsd(cfg.messagingRates, market, category ?? 'service')
    }
    const deliveredAt = entry.timestamp
      ? new Date(Number(entry.timestamp) * 1000).toISOString()
      : new Date().toISOString()
    await svc
      .from('messaging_cost_events')
      .update({
        status: 'delivered',
        delivered_at: deliveredAt,
        cost_usd: costUsd,
        market,
        ...(category ? { category } : {}),
      })
      .eq('id', current.id)
      .eq('status', 'sent')
  } catch (err) {
    console.warn('[messaging-cost] cost status update failed:', err instanceof Error ? err.message : String(err))
  }
}

/** Apply every status of a webhook payload, sequentially; one failure never stops the rest. */
export async function applyWhatsAppStatuses(entries: WhatsAppStatusEntry[]): Promise<void> {
  for (const entry of entries) {
    try {
      await applyWhatsAppStatus(entry)
    } catch (err) {
      console.warn('[messaging-cost] status entry failed:', err instanceof Error ? err.message : String(err))
    }
  }
}
