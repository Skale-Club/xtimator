import { buildWaMeLink } from '@/lib/whatsapp/wa-link'

/** Short-lived httpOnly cookie set when onboarding completes; the dashboard shows the card once. */
export const WHATSAPP_WELCOME_COOKIE = 'whatsapp_welcome'

/** Prefilled first message of the "Open in WhatsApp" click-to-chat link. */
export const WHATSAPP_FIRST_ESTIMATE_TEXT = 'Hi! I want to create my first estimate'

/** wa.me link to the platform number; null when no number is configured (hide the button). */
export function buildFirstEstimateLink(displayNumber: string | null | undefined): string | null {
  return buildWaMeLink(displayNumber, WHATSAPP_FIRST_ESTIMATE_TEXT)
}
