/**
 * WhatsApp error adapter — translate XtimatorError into a contextual WhatsApp message
 * sent back to the user instead of returning JSON.
 *
 * Usage:
 *   try { ... process inbound ... }
 *   catch (err) { await handleWhatsAppError(err, fromPhone) }
 */
import { XtimatorError } from '.'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'

/**
 * Codes that map to contextual WhatsApp messages.
 * Falls back to a generic "Something went wrong" for unknown codes / non-Xtimator errors.
 */
const whatsappMessageByCode: Partial<Record<string, string>> = {
  // Tier limits
  'tier_limit:estimates':
    '⚠️ You reached your monthly estimate limit. Upgrade your plan at xtimator.com/settings/billing to continue.',
  'tier_limit:whatsapp':
    '⚠️ Your current plan does not include the WhatsApp channel. Upgrade at xtimator.com/settings/billing to send estimates here.',
  'tier_limit:photos':
    '⚠️ You reached your photo analysis limit on this plan. Upgrade at xtimator.com/settings/billing.',

  // Rate limits
  'rate_limit:whatsapp':
    '⏸️ Slow down — too many messages in a short window. Try again in a few minutes.',

  // Bad requests
  'bad_request:recordings':
    "🎙️ Sorry, I couldn't process that audio. Please try recording again.",
  'bad_request:photos':
    "📸 Sorry, I couldn't process that photo. Please try sending it again.",
  'bad_request:whatsapp':
    "❓ I didn't understand. Reply *send* to deliver your estimate, *cancel* to discard, or use *edit*/*add*/*remove* commands to adjust before sending.",

  // Not found
  'not_found:estimates':
    "❌ I couldn't find an estimate for that. Please start a new one by sending audio, text, or photos.",

  // Offline
  'offline:translate':
    '⚠️ Translation service is temporarily unavailable. Your estimate will be sent in English.',
}

const FALLBACK_MESSAGE =
  '❌ Something went wrong on our side. Please try again in a moment. If the issue continues, contact support.'

/**
 * Send a contextual error message to the user via WhatsApp.
 * Never throws — failures to send the error message are swallowed (logged only).
 *
 * @param err - The thrown error
 * @param toPhone - E.164-format phone number with leading + (e.g. '+15551234567')
 */
export async function handleWhatsAppError(err: unknown, toPhone: string): Promise<void> {
  let body: string

  if (err instanceof XtimatorError) {
    body = whatsappMessageByCode[err.code] ?? FALLBACK_MESSAGE
    console.error(`[whatsapp][${err.code}]`, err.message, err.meta ?? '', err.cause ?? '')
  } else {
    body = FALLBACK_MESSAGE
    console.error('[whatsapp][internal:unknown]', err)
  }

  try {
    await sendWhatsAppMessage(toPhone, { type: 'text', text: { body } })
  } catch (sendErr) {
    // Last-resort log; never re-throw from an error handler
    console.error('[whatsapp] Failed to send error message to user', sendErr)
  }
}
