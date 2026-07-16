/**
 * WhatsApp welcome message, sent on the owner's FIRST inbound contact.
 *
 * We only welcome people who actually have WhatsApp — proven by the fact that
 * they messaged us. The copy is localized (pt/en/es) via buildWelcomeMessage,
 * mirroring buildAskDetailsMessage: the language is resolved from the owner's
 * company default (companies.default_estimate_language) through the shared
 * per-estimate language cascade, with an English-first fallback.
 *
 * whatsapp_company_configs is RLS deny-all — always call with a service-role client.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import {
  resolveEstimateLanguage,
  type EstimateLanguage,
} from '@/lib/i18n/resolve-estimate-language'

const WELCOME_MESSAGES: Record<EstimateLanguage, string> = {
  en: [
    '👋 Welcome to Xtimator!',
    '',
    "You're all set to create professional estimates right here on WhatsApp. Just send a voice message or text describing the job — I'll generate a ready-to-send estimate in seconds. You can also ask me questions any time.",
    '',
    'Prefer to use the app instead? You can create and manage everything there too — whatever works best for you on the job site.',
    '',
    '💡 *Tip:* If you write in Portuguese, I\'ll reply in Portuguese. 🇧🇷',
    '',
    'Go ahead — describe your first job!',
  ].join('\n'),
  pt: [
    '👋 Bem-vindo ao Xtimator!',
    '',
    'Tudo pronto para você criar orçamentos profissionais aqui mesmo no WhatsApp. É só enviar um áudio ou uma mensagem de texto descrevendo o serviço — eu gero um orçamento pronto para enviar em segundos. Você também pode me fazer perguntas a qualquer momento.',
    '',
    'Prefere usar o app? Você também pode criar e gerenciar tudo por lá — o que funcionar melhor para você no local de trabalho.',
    '',
    '💡 *Dica:* Escreva no idioma que preferir e eu respondo no mesmo idioma. 🇧🇷',
    '',
    'Pode começar — descreva o seu primeiro serviço!',
  ].join('\n'),
  es: [
    '👋 ¡Bienvenido a Xtimator!',
    '',
    'Ya está todo listo para crear presupuestos profesionales aquí mismo en WhatsApp. Solo envíe un audio o un mensaje de texto describiendo el trabajo — generaré un presupuesto listo para enviar en segundos. También puede hacerme preguntas en cualquier momento.',
    '',
    '¿Prefiere usar la app? También puede crear y gestionar todo desde ahí — lo que mejor le funcione en la obra.',
    '',
    '💡 *Consejo:* Escriba en el idioma que prefiera y le responderé en el mismo idioma. 🌎',
    '',
    '¡Adelante — describa su primer trabajo!',
  ].join('\n'),
}

/**
 * Localized first-contact welcome copy. Mirrors buildAskDetailsMessage:
 * unknown languages fall back to English (English-first principle).
 */
export function buildWelcomeMessage(language: EstimateLanguage): string {
  return WELCOME_MESSAGES[language] ?? WELCOME_MESSAGES.en
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
 * Resolve the welcome language from the company default
 * (companies.default_estimate_language) through the shared per-estimate
 * language cascade. Called only after the claim is won, so the select runs
 * once per company ever — never on the webhook hot path. Best-effort: any
 * failure falls back to English.
 */
async function resolveWelcomeLanguage(
  serviceClient: SupabaseClient,
  companyId: string
): Promise<EstimateLanguage> {
  try {
    const { data } = await serviceClient
      .from('companies')
      .select('default_estimate_language')
      .eq('id', companyId)
      .single()
    return resolveEstimateLanguage({
      companyDefault: (data?.default_estimate_language as EstimateLanguage | null) ?? null,
    })
  } catch {
    return 'en'
  }
}

/**
 * First-contact convenience: claim the welcome slot, and if won, resolve the
 * company's language and send the message. Best-effort — never throws.
 * Returns true if the welcome was sent.
 */
export async function welcomeOnFirstContact(
  serviceClient: SupabaseClient,
  companyId: string,
  toPhone: string
): Promise<boolean> {
  const claimed = await claimWhatsAppWelcome(serviceClient, companyId)
  if (!claimed) return false
  try {
    const body = buildWelcomeMessage(await resolveWelcomeLanguage(serviceClient, companyId))
    await sendWhatsAppMessage(toPhone, { type: 'text', text: { body } })
    logOutboundMessage(serviceClient, {
      companyId,
      contactPhone: toPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    return true
  } catch (err) {
    console.warn('[WhatsApp] welcome message send failed', err)
    return false
  }
}
