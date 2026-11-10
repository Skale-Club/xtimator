/**
 * Business-initiated WhatsApp messages to the OWNER, 24h-window aware.
 *
 * Meta only allows free-form text within 24h of the owner's last inbound message;
 * outside that window only an approved template goes through (error 131047
 * otherwise). Replies to an inbound message are always inside the window and keep
 * calling sendWhatsAppMessage directly. Anything the platform starts on its own
 * (notifications, the session-expiry notice, delayed "estimate ready" nudges)
 * goes through sendOwnerWhatsApp:
 *
 *   inside the window   -> free-form text (cheaper); if Meta still answers 131047
 *                          or 131049, ONE template fallback, never a loop
 *   outside the window  -> the mapped template; no template -> { ok: false }
 *   template failure    -> { ok: false }, no further attempt
 *
 * Never throws. The WhatsApp opt-in (`whatsapp_opt_in_at`) is enforced upstream in
 * lib/notifications/preferences.ts and is not re-checked here.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MessagingMeta } from '@/lib/billing/messaging-events'
import {
  isTemplateRequiredError,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
} from '@/lib/whatsapp/client'
import { isWithinReplyWindow, toE164 } from '@/lib/whatsapp/conversations'

export interface OwnerTemplate {
  name: string
  languageCode: string
  bodyVariables: string[]
}

export type OwnerSendResult =
  | { ok: true; mode: 'freeform' | 'template'; wamid: string | null; fellBack: boolean }
  | { ok: false; error: 'outside_window_no_template' | 'send_failed'; message?: string }

/** Last inbound message time from the owner's conversation row, or null when unknown. */
export async function getOwnerLastInboundAt(
  svc: SupabaseClient,
  companyId: string,
  ownerPhone: string,
): Promise<string | null> {
  try {
    const { data } = await svc
      .from('whatsapp_conversations')
      .select('last_inbound_at')
      .eq('company_id', companyId)
      .eq('contact_phone', toE164(ownerPhone))
      .order('last_inbound_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    return (data?.last_inbound_at as string | null | undefined) ?? null
  } catch {
    return null
  }
}

export async function sendOwnerWhatsApp(opts: {
  to: string
  companyId: string | null
  /** Free-form body, used only inside the 24h window. */
  text: string
  /** Approved template for outside the window and for the 131047 fallback. */
  template: OwnerTemplate | null
  meta: MessagingMeta
  /** ISO time of the owner's last inbound message. Pass null when known to be absent. */
  lastInboundAt: string | null
}): Promise<OwnerSendResult> {
  const { to, text, template, meta } = opts

  const sendTemplate = async (fellBack: boolean): Promise<OwnerSendResult> => {
    if (!template) return { ok: false, error: 'outside_window_no_template' }
    try {
      const wamid = await sendWhatsAppTemplate(
        to,
        {
          name: template.name,
          languageCode: template.languageCode,
          bodyVariables: template.bodyVariables,
        },
        meta,
      )
      return { ok: true, mode: 'template', wamid, fellBack }
    } catch (err) {
      // One template attempt only: a failing template is final.
      return { ok: false, error: 'send_failed', message: err instanceof Error ? err.message : String(err) }
    }
  }

  if (!isWithinReplyWindow(opts.lastInboundAt)) return sendTemplate(false)

  try {
    const wamid = await sendWhatsAppMessage(to, { type: 'text', text: { body: text } }, meta)
    return { ok: true, mode: 'freeform', wamid, fellBack: false }
  } catch (err) {
    if (isTemplateRequiredError(err)) return sendTemplate(true)
    return { ok: false, error: 'send_failed', message: err instanceof Error ? err.message : String(err) }
  }
}
