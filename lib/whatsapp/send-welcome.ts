/**
 * WhatsApp welcome sequence, sent after the owner's FIRST inbound message
 * (the reply to the welcome template, or any first message).
 *
 * We only welcome people who actually have WhatsApp — proven by the fact that
 * they messaged us. The sequence is three SHORT messages sent one after another
 * (content kept, delivery chopped; never a wall of text):
 *   1. what the assistant does
 *   2. the how-it-works video (a line + URL), or a text placeholder until the
 *      owner has recorded the video for that language (assets never block)
 *   3. a call to send the first job now
 * The copy is localized (pt/en/es). The language is resolved from the owner's
 * company default (companies.default_estimate_language) through the shared
 * per-estimate language cascade, with an English-first fallback. The video URL
 * comes from the admin config (platform_integrations.meta_whatsapp metadata).
 *
 * whatsapp_company_configs is RLS deny-all — always call with a service-role client.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import { getWhatsAppWelcomeConfig } from '@/lib/platform-config'
import { type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import { resolveOwnerLanguage } from '@/lib/whatsapp/owner-language'

type WelcomeCopy = {
  intro: string
  videoWithUrl: (url: string) => string
  videoPlaceholder: string
  tryNow: string
}

const WELCOME_COPY: Record<EstimateLanguage, WelcomeCopy> = {
  pt: {
    intro:
      'Olá! Eu sou o assistente da Xtimator. Por aqui você cria orçamentos profissionais mandando áudio e fotos do serviço.',
    videoWithUrl: (url) => `Veja em 1 minuto como funciona: ${url}`,
    videoPlaceholder: 'Em breve vou te mandar um vídeo curto mostrando como funciona.',
    tryNow: 'Quer testar agora? Me manda um áudio contando o serviço que você precisa orçar.',
  },
  en: {
    intro:
      "Hi! I'm the Xtimator assistant. Right here you can create professional estimates by sending audio and photos of the job.",
    videoWithUrl: (url) => `See how it works in 1 minute: ${url}`,
    videoPlaceholder: "I'll send you a short video soon showing how it works.",
    tryNow: 'Want to try it now? Send me a voice message describing the job you need to estimate.',
  },
  es: {
    intro:
      '¡Hola! Soy el asistente de Xtimator. Aquí puede crear presupuestos profesionales enviando audio y fotos del trabajo.',
    videoWithUrl: (url) => `Vea cómo funciona en 1 minuto: ${url}`,
    videoPlaceholder: 'Pronto le enviaré un video corto mostrando cómo funciona.',
    tryNow: '¿Quiere probar ahora? Envíeme un audio contando el trabajo que necesita presupuestar.',
  },
}

/**
 * The welcome sequence as an ordered list of short messages. Unknown languages
 * fall back to English (English-first principle). `videoUrl` empty/null → the
 * text placeholder replaces the video message.
 */
export function buildWelcomeSequence(
  language: EstimateLanguage,
  videoUrl?: string | null
): string[] {
  const copy = WELCOME_COPY[language] ?? WELCOME_COPY.en
  const url = videoUrl?.trim()
  return [copy.intro, url ? copy.videoWithUrl(url) : copy.videoPlaceholder, copy.tryNow]
}

/**
 * Atomically claim the "first contact" welcome for a company. Returns true only
 * for the caller that flips welcome_sent_at from NULL → now(), so concurrent
 * inbound messages never double-send. Returns false if already welcomed (or on error).
 */
export async function claimWhatsAppWelcome(
  serviceClient: SupabaseClient,
  companyId: string
): Promise<boolean> {
  const { data, error } = await serviceClient
    .from('whatsapp_company_configs')
    .update({ welcome_sent_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .is('welcome_sent_at', null)
    .select('company_id')

  if (error) {
    console.warn('[WhatsApp] claimWhatsAppWelcome failed', error)
    return false
  }
  return Array.isArray(data) && data.length > 0
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
 * First-contact convenience: claim the welcome slot, and if won, resolve the
 * company's language and send the three-message sequence in order (each awaited
 * before the next). Best-effort — never throws. Returns true if the whole
 * sequence was sent; if a message fails, the rest are not sent.
 */
export async function welcomeOnFirstContact(
  serviceClient: SupabaseClient,
  companyId: string,
  toPhone: string
): Promise<boolean> {
  const claimed = await claimWhatsAppWelcome(serviceClient, companyId)
  if (!claimed) return false
  try {
    const language = await resolveWelcomeLanguage(serviceClient, companyId)
    const videoUrl = await getWhatsAppWelcomeConfig()
      .then((c) => c.videoUrls[language])
      .catch(() => null)
    const messages = buildWelcomeSequence(language, videoUrl)

    for (const body of messages) {
      // Onboarding welcome: a PLATFORM cost, recorded but never billed to the customer.
      const wamid = await sendWhatsAppMessage(
        toPhone,
        { type: 'text', text: { body } },
        { companyId, purpose: 'welcome', billable: false }
      )
      logOutboundMessage(serviceClient, {
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
    console.warn('[WhatsApp] welcome message send failed', err)
    return false
  }
}
