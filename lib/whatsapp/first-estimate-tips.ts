/**
 * Phase 3b: two short tip messages after the owner's FIRST ready estimate on
 * WhatsApp (action-triggered, never timer-based: the owner just interacted, so we
 * are inside the 24h customer-service window and free-form text is allowed).
 *
 *   1. how to edit the estimate by voice or text on WhatsApp
 *   2. how to send it to the client from the app (SMS or email)
 *
 * Sent once per company: whatsapp_company_configs.first_estimate_tips_sent_at is
 * claimed atomically. A platform cost: purpose 'welcome', never billed.
 * Best-effort, never throws. whatsapp_company_configs is RLS deny-all: service client.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

const TIPS: Record<EstimateLanguage, [string, string]> = {
  pt: [
    'Dica: para ajustar o orçamento, é só me mandar um áudio ou texto dizendo o que mudar.',
    'Para enviar ao seu cliente, abra o orçamento no app e envie por SMS ou e-mail.',
  ],
  en: [
    'Tip: to adjust the estimate, just send me a voice message or text saying what to change.',
    'To send it to your client, open the estimate in the app and send it by SMS or email.',
  ],
  es: [
    'Consejo: para ajustar el presupuesto, solo envíeme un audio o texto diciendo qué cambiar.',
    'Para enviarlo a su cliente, abra el presupuesto en la app y envíelo por SMS o correo.',
  ],
}

export function buildFirstEstimateTips(language: EstimateLanguage): [string, string] {
  return TIPS[language] ?? TIPS.en
}

/** Flip first_estimate_tips_sent_at NULL -> now(); true only for the winning caller. */
export async function claimFirstEstimateTips(
  serviceClient: SupabaseClient,
  companyId: string
): Promise<boolean> {
  const { data, error } = await serviceClient
    .from('whatsapp_company_configs')
    .update({ first_estimate_tips_sent_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .is('first_estimate_tips_sent_at', null)
    .select('company_id')
  if (error) {
    console.warn('[WhatsApp] claimFirstEstimateTips failed', error)
    return false
  }
  return Array.isArray(data) && data.length > 0
}

/**
 * Call right after the "estimate ready" confirmation was sent. Returns true if
 * the two tips were sent (first ready estimate for the company).
 */
export async function sendFirstEstimateTips(
  serviceClient: SupabaseClient,
  companyId: string,
  toPhone: string,
  language: EstimateLanguage
): Promise<boolean> {
  try {
    if (!(await claimFirstEstimateTips(serviceClient, companyId))) return false
    for (const body of buildFirstEstimateTips(language)) {
      const wamid = await sendWhatsAppMessage(
        toPhone,
        { type: 'text', text: { body } },
        { companyId, purpose: 'welcome', billable: false }
      )
      await logOutboundMessage(serviceClient, {
        companyId,
        contactPhone: toPhone,
        body,
        msgType: 'text',
        waMessageId: wamid,
        status: 'sent',
      }).catch(() => undefined)
    }
    return true
  } catch (err) {
    console.warn('[WhatsApp] first-estimate tips failed', err instanceof Error ? err.message : err)
    return false
  }
}
