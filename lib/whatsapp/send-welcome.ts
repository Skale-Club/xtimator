/**
 * WhatsApp welcome sequence, sent after the owner's FIRST inbound message
 * (the reply to the welcome template, or any first message).
 *
 * We only welcome people who actually have WhatsApp — proven by the fact that
 * they messaged us. The sequence is three SHORT messages sent one after another
 * (content kept, delivery chopped; never a wall of text):
 *   1. what the assistant does
 *   2. a how-it-works video (a line + URL) or localized usage guidance
 *   3. a call to send the first job now
 * The copy is localized (pt/en/es). The language is resolved from the owner's
 * company default (companies.default_estimate_language) through the shared
 * per-estimate language cascade, with an English-first fallback. The video URL
 * comes from the admin config (platform_integrations.meta_whatsapp metadata).
 *
 * whatsapp_company_configs is RLS deny-all — always call with a service-role client.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { isExplicitWhatsAppSendRejection, sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { isWhatsAppOutboundBlocked } from '@/lib/whatsapp/outbound-guard'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import { getWhatsAppPlatformConfig, getWhatsAppWelcomeConfig } from '@/lib/platform-config'
import { type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import { resolveOwnerLanguage } from '@/lib/whatsapp/owner-language'

type WelcomeCopy = {
  intro: string
  videoWithUrl: (url: string) => string
  usageGuide: string
  tryNow: string
}

const WELCOME_COPY: Record<EstimateLanguage, WelcomeCopy> = {
  pt: {
    intro:
      'Olá! Eu sou o assistente da Xtimator. Por aqui você cria orçamentos profissionais mandando áudio e fotos do serviço.',
    videoWithUrl: (url) => `Veja em 1 minuto como funciona: ${url}`,
    usageGuide: 'Inclua medidas, materiais e os preços que você já sabe. Você também pode mandar fotos.',
    tryNow: 'Quer testar? Mande um áudio contando o serviço. Você pode revisar o rascunho antes de enviar o orçamento.',
  },
  en: {
    intro:
      "Hi! I'm the Xtimator assistant. Right here you can create professional estimates by sending audio and photos of the job.",
    videoWithUrl: (url) => `See how it works in 1 minute: ${url}`,
    usageGuide: 'Include measurements, materials, and any prices you know. You can also send photos.',
    tryNow: 'Want to try it? Send a voice message about the job. You can review the draft before sending the estimate.',
  },
  es: {
    intro:
      '¡Hola! Soy el asistente de Xtimator. Aquí puede crear presupuestos profesionales enviando audio y fotos del trabajo.',
    videoWithUrl: (url) => `Vea cómo funciona en 1 minuto: ${url}`,
    usageGuide: 'Incluya medidas, materiales y los precios que conozca. También puede enviar fotos.',
    tryNow: '¿Quiere probar? Envíeme un audio sobre el trabajo. Puede revisar el borrador antes de enviar el presupuesto.',
  },
}

/**
 * The welcome sequence as an ordered list of short messages. Unknown languages
 * fall back to English (English-first principle). `videoUrl` empty/null → the
 * usage guidance replaces the video message.
 */
export function buildWelcomeSequence(
  language: EstimateLanguage,
  videoUrl?: string | null
): string[] {
  const copy = WELCOME_COPY[language] ?? WELCOME_COPY.en
  const url = videoUrl?.trim()
  return [copy.intro, url ? copy.videoWithUrl(url) : copy.usageGuide, copy.tryNow]
}

/**
 * Resolve the owner-facing language from the company default
 * (companies.default_estimate_language) through the shared per-estimate
 * language cascade. Called only after a claim is won, so the select runs once
 * per company per flow — never on the webhook hot path. Best-effort: any
 * failure falls back to English.
 */
export async function resolveWelcomeLanguage(
  serviceClient: SupabaseClient,
  companyId: string
): Promise<EstimateLanguage> {
  return resolveOwnerLanguage(serviceClient, companyId)
}

/**
 * Send or resume the company welcome for the authorized phone opening the
 * conversation. Only an accepted Meta message advances progress. A subsequent
 * inbound from the same phone retries the first unfinished step.
 */
export async function welcomeOnFirstContact(
  serviceClient: SupabaseClient,
  companyId: string,
  toPhone: string
): Promise<boolean> {
  if (isWhatsAppOutboundBlocked()) return false
  const token = randomUUID()
  let claimed = false
  let complete = false
  let sendUncertain = false
  try {
    const { data: lease, error: claimError } = await serviceClient
      .rpc('claim_whatsapp_welcome', {
        p_company_id: companyId,
        p_recipient: toPhone,
        p_token: token,
      })
      .maybeSingle<{ next_step: number }>()
    if (claimError) throw claimError
    if (!lease) return false
    claimed = true

    const [language, platform] = await Promise.all([
      resolveWelcomeLanguage(serviceClient, companyId),
      getWhatsAppPlatformConfig(),
    ])
    if (!platform.accessToken || !platform.phoneNumberId) return false
    const videoUrl = await getWhatsAppWelcomeConfig()
      .then((c) => c.videoUrls[language])
      .catch(() => null)
    const messages = buildWelcomeSequence(language, videoUrl)

    for (let index = lease.next_step; index < messages.length; index++) {
      const body = messages[index]
      const { data: sendSlot, error: slotError } = await serviceClient
        .from('whatsapp_company_configs')
        .update({
          welcome_sending_step: index,
          welcome_claim_until: new Date(Date.now() + 5 * 60_000).toISOString(),
        })
        .eq('company_id', companyId)
        .eq('status', 'active')
        .eq('welcome_claim_token', token)
        .eq('welcome_next_step', index)
        .is('welcome_sending_step', null)
        .select('company_id')
      if (slotError || !sendSlot?.length) throw slotError ?? new Error('Welcome lease was lost.')

      sendUncertain = true
      let wamid: string | null
      try {
        wamid = await sendWhatsAppMessage(
          toPhone,
          { type: 'text', text: { body } },
          { companyId, purpose: 'welcome', billable: false }
        )
      } catch (err) {
        if (isExplicitWhatsAppSendRejection(err)) sendUncertain = false
        throw err
      }
      if (!wamid) throw new Error('Welcome message was not confirmed by Meta.')

      const now = new Date()
      const last = index + 1 === messages.length
      const { data: advanced, error: advanceError } = await serviceClient
        .from('whatsapp_company_configs')
        .update({
          welcome_next_step: index + 1,
          welcome_sending_step: null,
          welcome_claim_until: last ? null : new Date(now.getTime() + 5 * 60_000).toISOString(),
          ...(last ? { welcome_sent_at: now.toISOString(), welcome_claim_token: null } : {}),
        })
        .eq('company_id', companyId)
        .eq('welcome_claim_token', token)
        .eq('welcome_next_step', index)
        .select('company_id')
      if (advanceError || !advanced?.length) throw advanceError ?? new Error('Welcome lease was lost.')
      sendUncertain = false
      complete = last

      await logOutboundMessage(serviceClient, {
        companyId,
        contactPhone: toPhone,
        ownerPhone: toPhone,
        body,
        msgType: 'text',
        waMessageId: wamid,
        status: 'sent',
      }).catch(() => undefined)
    }
    return complete
  } catch (err) {
    console.warn('[WhatsApp] welcome message send failed', { sendUncertain, companyId, error: err instanceof Error ? err.name : 'database' })
    return false
  } finally {
    if (claimed && !complete && !sendUncertain) {
      try {
        const { error } = await serviceClient
          .from('whatsapp_company_configs')
          .update({ welcome_claim_until: null, welcome_claim_token: null, welcome_sending_step: null })
          .eq('company_id', companyId)
          .eq('welcome_claim_token', token)
        if (error) throw error
      } catch (err) {
        console.warn('[WhatsApp] welcome lease release failed; lease will expire', err)
      }
    }
  }
}
