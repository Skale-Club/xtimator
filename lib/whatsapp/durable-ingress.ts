import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { requireServiceClient } from '@/lib/supabase/service'
import { inngest } from '@/lib/inngest/client'
import { stageInboundMessage, type QueuedPhone } from '@/lib/whatsapp/stage-inbound'
import { applyTemplateStatusUpdate } from '@/lib/whatsapp/template-status'
import { applyWhatsAppStatuses } from '@/lib/billing/messaging-cost'
import { findActiveWhatsAppSender } from '@/lib/whatsapp/account-registry'
import { planDurableInboundRoute, processDurableInboundBatch, type DurableInboundRoute } from '@/lib/whatsapp/handler'
import type { WhatsAppMessage, WhatsAppPayload } from '@/lib/whatsapp/types'
import { notifyOps } from '@/lib/observability/ops-alert'
import { getWhatsAppPlatformConfig } from '@/lib/platform-config'
import { assertCompanyWritable } from '@/lib/demo/guard'

export const EVENT_WHATSAPP_WEBHOOK = 'whatsapp/webhook.accepted' as const
export const EVENT_WHATSAPP_INGRESS_BATCH = 'whatsapp/ingress.ready' as const
const retryAt = () => new Date(Date.now() + 30_000).toISOString()

/** The only ACK boundary: a committed service-only row, not an in-process callback. */
export async function acceptWhatsAppWebhook(rawBody: string, payload: WhatsAppPayload): Promise<string> {
  const id = createHash('sha256').update(rawBody).digest('hex')
  const { error } = await requireServiceClient().from('whatsapp_webhook_inbox')
    .upsert({ id, payload }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error('WhatsApp webhook persistence unavailable')
  // If Inngest is unavailable the minute recovery worker will publish this row.
  try { await inngest.send({ name: EVENT_WHATSAPP_WEBHOOK, id: `wa-hook-${id}`, data: { inboxId: id } }) }
  catch { console.warn('[WhatsApp] accepted webhook awaiting queue recovery', { inboxId: id }) }
  return id
}

export async function processWhatsAppWebhook(inboxId: string): Promise<void> {
  const svc = requireServiceClient()
  const lease = randomUUID()
  const claim = await svc.rpc('claim_whatsapp_webhook', { p_id: inboxId, p_lease_token: lease })
  if (claim.error) throw new Error('WhatsApp webhook claim failed')
  if (!claim.data) return
  try {
    const { data: inbox, error: inboxError } = await svc.from('whatsapp_webhook_inbox')
      .select('attempts').eq('id', inboxId).eq('lease_token', lease).maybeSingle()
    if (inboxError || !inbox) throw new Error('WhatsApp webhook attempt lookup failed')
    const recovering = inbox.attempts > 1
    const payload = claim.data as WhatsAppPayload
    const config = await getWhatsAppPlatformConfig()
    if (!config.phoneNumberId || !config.wabaId) throw new Error('WhatsApp inbound target is not configured')
    const phones = new Map<string, QueuedPhone>()
    const failures: unknown[] = []
    // Every change is independent: statuses/templates never short-circuit inbound.
    for (const entry of payload.entry ?? []) {
      // The app secret may sign deliveries for several WABAs. A valid signature
      // does not authorize this application's tools for a different destination.
      if (entry.id !== config.wabaId) continue
      for (const change of entry.changes ?? []) {
        const value = change.value
        const platformPhone = value?.metadata?.phone_number_id === config.phoneNumberId
        if (platformPhone && value?.statuses?.length) {
          try { await applyWhatsAppStatuses(value.statuses, { strict: true }) }
          catch (error) { failures.push(error) }
        }
        const loose = change as unknown as { field?: string; value?: Record<string, unknown> }
        if (loose.field === 'message_template_status_update' && loose.value) {
          const v = loose.value
          try { await applyTemplateStatusUpdate({
            message_template_id: ['string', 'number'].includes(typeof v.message_template_id) ? String(v.message_template_id) : undefined,
            template_name: typeof v.message_template_name === 'string' ? v.message_template_name : undefined,
            language: typeof v.message_template_language === 'string' ? v.message_template_language : undefined,
            event: String(v.event ?? ''),
            reason: typeof v.reason === 'string' ? v.reason : undefined,
          }) } catch (error) { failures.push(error) }
        }
        // Staging is quick; all messages enter durable storage before debounce.
        for (const message of platformPhone ? value?.messages ?? [] : []) {
          try {
            const phone = await stageInboundMessage(message, value, { recovering })
            if (phone) phones.set(`${phone.companyId}:${phone.ownerPhone}`, phone)
          } catch (error) { failures.push(error) }
        }
      }
    }
    for (const phone of phones.values()) {
      try { await inngest.send({ name: EVENT_WHATSAPP_INGRESS_BATCH, data: phone }) }
      catch (error) { failures.push(error) }
    }
    if (failures.length) throw new AggregateError(failures, 'WhatsApp webhook items pending retry')
    const done = await svc.from('whatsapp_webhook_inbox').update({
      state: 'complete', completed_at: new Date().toISOString(), lease_token: null, lease_until: null, last_error: null,
    }).eq('id', inboxId).eq('lease_token', lease)
    if (done.error) throw new Error('WhatsApp webhook completion failed')
  } catch (error) {
    await svc.from('whatsapp_webhook_inbox').update({ state: 'pending', lease_token: null,
      lease_until: null, next_attempt_at: retryAt(), last_error: 'processing_failed',
    }).eq('id', inboxId).eq('lease_token', lease)
    throw error
  }
}

interface ClaimedBatch {
  id: string
  companyId: string
  ownerPhone: string
  senderUserId: string | null
  route?: DurableInboundRoute | null
  entries: Array<{ message: WhatsAppMessage; senderUserId: string | null }>
}

export async function processWhatsAppIngressBatch(phone: QueuedPhone): Promise<void> {
  if (await assertCompanyWritable(phone.companyId)) return
  const svc = requireServiceClient()
  const lease = randomUUID()
  const claim = await svc.rpc('claim_whatsapp_ingress_batch', {
    p_company_id: phone.companyId, p_owner_phone: phone.ownerPhone, p_lease_token: lease,
  })
  if (claim.error) throw new Error('WhatsApp batch claim failed')
  if (!claim.data) return
  const batch = claim.data as ClaimedBatch
  try {
    const sender = await findActiveWhatsAppSender(batch.ownerPhone, { throwOnError: true })
    const valid = sender && sender.companyId === batch.companyId &&
      batch.entries.every(e => e.senderUserId === sender.userId)
    if (!valid) {
      const revoked = await svc.from('whatsapp_ingress_batches').update({ state: 'revoked',
        completed_at: new Date().toISOString(), lease_token: null, lease_until: null,
      }).eq('id', batch.id).eq('lease_token', lease)
      if (revoked.error) throw new Error('WhatsApp revoked batch update failed')
      return
    }
    const messages = batch.entries.map(e => e.message)
    let route = batch.route
    if (!route) {
      route = await planDurableInboundRoute(messages, batch.companyId, batch.ownerPhone, svc)
      // A route is immutable once dispatched. Retrying after a failed completion
      // cannot reinterpret an old audio/photo burst as edits to its new draft.
      const saved = await svc.from('whatsapp_ingress_batches').update({ dispatch_route: route })
        .eq('id', batch.id).eq('lease_token', lease).is('dispatch_route', null).select('id').maybeSingle()
      if (saved.error || !saved.data) throw new Error('WhatsApp batch route checkpoint failed')
    }
    await processDurableInboundBatch(messages, batch.companyId,
      batch.ownerPhone.slice(1), svc, { batchKey: `wa-ingress-${batch.id}`, senderUserId: sender.userId, route })
    const done = await svc.from('whatsapp_ingress_batches').update({ state: 'complete',
      completed_at: new Date().toISOString(), lease_token: null, lease_until: null, last_error: null,
    }).eq('id', batch.id).eq('lease_token', lease)
    if (done.error) throw new Error('WhatsApp batch completion failed')
  } catch (error) {
    await svc.from('whatsapp_ingress_batches').update({ state: 'pending', lease_token: null,
      lease_until: null, next_attempt_at: retryAt(), last_error: 'dispatch_failed',
    }).eq('id', batch.id).eq('lease_token', lease)
    throw error
  }
}

export async function recoverWhatsAppIngress(): Promise<void> {
  const svc = requireServiceClient()
  const now = new Date().toISOString()
  const hooks = await svc.from('whatsapp_webhook_inbox').select('id')
    .neq('state', 'complete').lte('next_attempt_at', now)
    .or(`state.eq.pending,lease_until.lt.${now}`).order('created_at').limit(100)
  if (hooks.error) throw new Error('WhatsApp pending webhook recovery read failed')
  const phones = await svc.rpc('due_whatsapp_ingress_phones', { p_limit: 100 })
  if (phones.error) throw new Error('WhatsApp pending message recovery read failed')
  // Unique minute identity permits recovery after a previously exhausted run.
  const minute = Math.floor(Date.now() / 60_000)
  for (const hook of hooks.data ?? []) await inngest.send({ name: EVENT_WHATSAPP_WEBHOOK,
    id: `wa-hook-recover-${hook.id}-${minute}`, data: { inboxId: hook.id } })
  for (const phone of (phones.data ?? []) as Array<{ company_id: string; owner_phone: string }>) {
    await inngest.send({ name: EVENT_WHATSAPP_INGRESS_BATCH,
      id: `wa-batch-recover-${phone.company_id}-${phone.owner_phone}-${minute}`,
      data: { companyId: phone.company_id, ownerPhone: phone.owner_phone } })
  }
  // Retain message-ID tombstones for dedup. Clear completed payloads after seven
  // days so the recovery inbox does not become an unbounded copy of private media.
  const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString()
  const clean = await svc.from('whatsapp_webhook_inbox').update({ payload: {} })
    .eq('state', 'complete').lt('completed_at', cutoff).neq('payload', '{}')
  if (clean.error) throw new Error('WhatsApp webhook payload retention failed')
  const old = await svc.from('whatsapp_ingress_batches').select('id')
    .in('state', ['complete', 'revoked']).lt('completed_at', cutoff)
    .is('payload_cleared_at', null).limit(1000)
  if (old.error) throw new Error('WhatsApp completed batch retention read failed')
  if (old.data?.length) {
    const ids = old.data.map(row => row.id)
    const cleared = await svc.from('whatsapp_ingress_messages').update({ message: {} }).in('batch_id', ids)
    if (cleared.error) throw new Error('WhatsApp batch payload retention failed')
    const marked = await svc.from('whatsapp_ingress_batches').update({ payload_cleared_at: now }).in('id', ids)
    if (marked.error) throw new Error('WhatsApp retention checkpoint failed')
  }
  const oldWork = new Date(Date.now() - 10 * 60_000).toISOString()
  const stuck = await svc.from('whatsapp_webhook_inbox').select('id', { count: 'exact', head: true })
    .neq('state', 'complete').or(`attempts.gte.5,created_at.lt.${oldWork}`)
  if (stuck.error) throw new Error('WhatsApp retry health read failed')
  const stuckBatches = await svc.from('whatsapp_ingress_batches').select('id', { count: 'exact', head: true })
    .in('state', ['pending', 'processing']).or(`attempts.gte.5,created_at.lt.${oldWork}`)
  if (stuckBatches.error) throw new Error('WhatsApp batch health read failed')
  const pendingCount = (stuck.count ?? 0) + (stuckBatches.count ?? 0)
  if (pendingCount) await notifyOps({ kind: 'pipeline_stuck', severity: 'warning',
    title: 'WhatsApp inbound recovery needs attention',
    message: `${pendingCount} deliveries or batches are overdue or have failed at least five attempts. Payloads remain durable.`,
    dedupeKey: 'whatsapp-ingress-recovery', suppressWindowSec: 3600,
  })
}
