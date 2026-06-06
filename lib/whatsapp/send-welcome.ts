/**
 * Sends a one-time welcome message when a company links a phone number.
 * Always in English — the bot will mirror the user's language on replies.
 */
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'

const WELCOME_TEXT = [
  '👋 Welcome to Xtimator!',
  '',
  "You're all set to create professional estimates directly from WhatsApp. Just send a voice message or text describing the job — we'll generate a ready-to-send estimate in seconds.",
  '',
  'You can also create and manage your estimates in the Xtimator app anytime. Use whatever works best for you on the job site.',
  '',
  '💡 *Tip:* If you prefer to write in Portuguese, I\'ll respond in Portuguese too. 🇧🇷',
  '',
  'Ready when you are!',
].join('\n')

export async function sendWhatsAppWelcome(toPhone: string): Promise<void> {
  await sendWhatsAppMessage(toPhone, { type: 'text', text: { body: WELCOME_TEXT } })
}
