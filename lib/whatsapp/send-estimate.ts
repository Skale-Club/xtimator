/**
 * Deliver an estimate to a client over WhatsApp.
 *
 * Single source of truth shared by:
 *   - POST /api/estimates/[id]/send-whatsapp  (the project Send tab)
 *   - the /whatsapp inbox "send estimate" action
 *
 * Honors the company's delivery_format (share_link | formatted_text | pdf_attachment),
 * falls back to share_link if PDF generation fails, logs to estimate_deliveries +
 * estimate_activity, marks the estimate sent, and mirrors the message into the
 * inbox conversation thread.
 *
 * Pass a SERVICE client — whatsapp_* tables are RLS deny-all.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { formatEstimateForWhatsApp, type FormatterEstimate } from '@/lib/whatsapp/formatter'
import { generateAndUploadEstimatePDF } from '@/lib/whatsapp/pdf-delivery'
import { getBranding } from '@/lib/platform-config'
import { logOutboundMessage, toE164 } from '@/lib/whatsapp/conversations'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import { getWhatsAppAccountStatus } from '@/lib/whatsapp/account-registry'
import { buildEstimatePublicPath } from '@/lib/estimate/public-url'
import type { PresentationSettings } from '@/lib/estimate/presentation-settings'

export interface DeliverEstimateResult {
  ok: boolean
  error?: string
  /** Set when pdf_attachment was requested but delivery fell back to a share link. */
  fallback?: 'share_link'
}

type DeliveryFormat = 'share_link' | 'formatted_text' | 'pdf_attachment'

/**
 * Phase 163 (SENDHUB-02): the hub's format choice at Send time. Independent
 * of the company's account-wide `deliveryFormat` preference above. When the
 * hub picks 'pdf' or 'plain_text', `effectiveDeliveryFormat` is forced to
 * 'share_link' regardless of the account preference -- Meta must NEVER get a
 * `type: 'document'` payload for those two formats.
 */
export type SendFormat = 'online_link' | 'pdf' | 'plain_text'

export async function deliverEstimateViaWhatsApp(params: {
  svc: SupabaseClient
  estimateId: string
  companyId: string
  toPhone: string
  clientId?: string | null
  clientName?: string | null
  customMessage?: string | null
  /**
   * Phase 163 (SENDHUB-02): the hub's format choice. Optional/nullable to
   * preserve back-compat with callers that pre-date the hub (the inbox
   * "send estimate" action currently omits it, resolving to today's behaviour
   * -- account-wide `deliveryFormat` applies).
   */
  format?: SendFormat | null
}): Promise<DeliverEstimateResult> {
  const { svc, estimateId, companyId } = params
  const toPhone = toE164(params.toPhone)

  // 1. Estimate (scoped to company) with the fields the formatter needs.
  //    Phase 163 (SENDHUB-04): also pull `presentation_settings` so the
  //    formatted_text branch's formatter can honour the toggle.
  const { data: estimate } = await svc
    .from('estimates')
    .select(`
      id, project_id, share_token, public_slug_token, total, subtotal, tax_rate, tax_amount,
      deposit_type, deposit_value, balance_due,
      currency_code, summary, payment_terms, timeline, language, presentation_settings,
      sections:estimate_sections(
        title, subtotal,
        items:estimate_items(description, quantity, unit, unit_price, total)
      )
    `)
    .eq('id', estimateId)
    .eq('company_id', companyId)
    .single()

  if (!estimate) return { ok: false, error: 'Estimate not found' }
  if (!estimate.share_token) return { ok: false, error: 'Estimate has no share link' }

  // 2. Delivery format + company info.
  const [accountStatus, { data: company }] = await Promise.all([
    getWhatsAppAccountStatus(companyId),
    svc.from('companies').select('name, owner_name, website, slug').eq('id', companyId).single(),
  ])
  const deliveryFormat = (accountStatus.deliveryFormat ?? 'share_link') as DeliveryFormat
  const companyName = (company?.name as string | null) ?? null
  const ownerName = (company?.owner_name as string | null) ?? null
  const companyWebsite = (company?.website as string | null) ?? null

  // Phase 163 (SENDHUB-02): PDF or Plain Text over WhatsApp ALWAYS falls back
  // to the share link. The company's account-wide `pdf_attachment` /
  // `formatted_text` preference is honoured ONLY for the `online_link` format.
  // Byte-identical to today's `share_link` behaviour for the fallback path.
  // Meta must NEVER get a `type: 'document'` payload for pdf/plain_text.
  const effectiveDeliveryFormat: DeliveryFormat =
    (params.format === 'pdf' || params.format === 'plain_text')
      ? 'share_link'
      : deliveryFormat

  const branding = await getBranding()
  const baseUrl = branding.canonicalBaseUrl ?? getCanonicalBaseUrl()
  const shareUrl = `${baseUrl}${buildEstimatePublicPath(
    { slug: company?.slug ?? null, name: companyName ?? 'Company' },
    { id: estimateId, public_slug_token: estimate.public_slug_token, share_token: estimate.share_token }
  )}`
  const shareMessage =
    params.customMessage?.trim() ||
    `${companyName ?? 'We'} sent you an estimate. Review and approve it here: ${shareUrl}`

  // 3. Send, honoring delivery format (pdf falls back to share_link on failure).
  let fallback: 'share_link' | undefined
  let sentType: 'text' | 'document' = 'text'
  let sentPreview = shareMessage

  try {
    if (effectiveDeliveryFormat === 'pdf_attachment') {
      try {
        const { signedUrl, filename } = await generateAndUploadEstimatePDF(
          estimateId,
          companyId,
          svc,
          params.clientName ?? null,
        )
        await sendWhatsAppMessage(toPhone, {
          type: 'document',
          document: {
            link: signedUrl,
            filename,
            caption: companyName ? `Your estimate from ${companyName}` : 'Your estimate',
          },
        })
        sentType = 'document'
        sentPreview = filename
      } catch (pdfErr) {
        console.error('[WhatsApp] PDF delivery failed, falling back to share_link:', pdfErr)
        await sendWhatsAppMessage(toPhone, { type: 'text', text: { body: shareMessage } })
        fallback = 'share_link'
      }
    } else if (effectiveDeliveryFormat === 'formatted_text') {
      const formatted = formatEstimateForWhatsApp(
        estimate as unknown as FormatterEstimate,
        params.clientName ?? null,
        companyName,
        ownerName,
        companyWebsite,
        // Phase 163 (SENDHUB-04): honour the toggle. Cast-with-fallback mirrors
        // components/share/estimate-view.tsx:157-161 -- dormant-first-safe.
        (estimate as { presentation_settings?: unknown }).presentation_settings as PresentationSettings | null | undefined ?? null,
      )
      await sendWhatsAppMessage(toPhone, { type: 'text', text: { body: formatted } })
      sentPreview = formatted
    } else {
      await sendWhatsAppMessage(toPhone, { type: 'text', text: { body: shareMessage } })
    }
  } catch (sendErr) {
    const errorMessage = sendErr instanceof Error ? sendErr.message : 'WhatsApp send failed'
    await svc.from('estimate_deliveries').insert({
      estimate_id: estimateId,
      company_id: companyId,
      channel: 'whatsapp',
      format: params.format ?? 'online_link',
      recipient_phone: toPhone,
      provider: 'meta',
      status: 'failed',
      error_message: errorMessage,
    })
    await logOutboundMessage(svc, {
      companyId,
      contactPhone: toPhone,
      clientId: params.clientId ?? null,
      contactName: params.clientName ?? null,
      body: sentPreview,
      msgType: sentType,
      status: 'failed',
      errorMessage,
    })
    return { ok: false, error: 'Failed to send via WhatsApp. Please try again.' }
  }

  // 4. Log success + mark estimate sent + activity + mirror into the inbox thread.
  const now = new Date().toISOString()
  await svc.from('estimate_deliveries').insert({
    estimate_id: estimateId,
    company_id: companyId,
    channel: 'whatsapp',
    format: params.format ?? 'online_link',
    recipient_phone: toPhone,
    provider: 'meta',
    status: 'sent',
    sent_at: now,
  })

  await svc.from('estimates').update({ sent_at: now }).eq('id', estimateId).is('sent_at', null)

  await svc.from('estimate_activity').insert({
    project_id: estimate.project_id,
    company_id: companyId,
    estimate_id: estimateId,
    event_type: 'estimate_sent',
    metadata: { channel: 'whatsapp', to: toPhone },
  })

  await logOutboundMessage(svc, {
    companyId,
    contactPhone: toPhone,
    clientId: params.clientId ?? null,
    contactName: params.clientName ?? null,
    body: sentPreview,
    msgType: sentType,
    status: 'sent',
  })

  return { ok: true, fallback }
}
