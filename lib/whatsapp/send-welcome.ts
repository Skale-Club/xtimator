/**
 * WhatsApp welcome message, sent on the owner's FIRST inbound contact.
 *
 * We only welcome people who actually have WhatsApp — proven by the fact that
 * they messaged us. The message is always in English; the bot mirrors the user's
 * language (e.g. Portuguese) on subsequent replies.
 *
 * company_whatsapp is RLS deny-all — always call with a service-role client.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'

const WELCOME_TEXT = [
  '👋 Welcome to Xtimator!',
  '',
  "You're all set to create professional estimates right here on WhatsApp. Just send a voice message or text describing the job — I'll generate a ready-to-send estimate in seconds. You can also ask me questions any time.",
  '',
  'Prefer to use the app instead? You can create and manage everything there too — whatever works best for you on the job site.',
  '',
  '💡 *Tip:* If you write in Portuguese, I\'ll reply in Portuguese. 🇧🇷',
  '',
  'Go ahead — describe your first job!',
].join('\n')

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
    .from('company_whatsapp')
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

/** Send the welcome message text to a recipient (E.164 with leading +). */
export async function sendWhatsAppWelcome(toPhone: string): Promise<void> {
  await sendWhatsAppMessage(toPhone, { type: 'text', text: { body: WELCOME_TEXT } })
}

/**
 * First-contact convenience: claim the welcome slot, and if won, send the message.
 * Best-effort — never throws. Returns true if the welcome was sent.
 */
export async function welcomeOnFirstContact(
  serviceClient: SupabaseClient,
  companyId: string,
  toPhone: string
): Promise<boolean> {
  const claimed = await claimWhatsAppWelcome(serviceClient, companyId)
  if (!claimed) return false
  try {
    await sendWhatsAppWelcome(toPhone)
    logOutboundMessage(serviceClient, {
      companyId,
      contactPhone: toPhone,
      body: WELCOME_TEXT,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    return true
  } catch (err) {
    console.warn('[WhatsApp] welcome message send failed', err)
    return false
  }
}
