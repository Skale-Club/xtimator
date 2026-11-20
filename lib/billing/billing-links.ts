import { getCanonicalBaseUrl } from '@/lib/utils/site-url'

/**
 * Credits plan 2026-11-20: where every "buy credits" / "subscribe" link lands.
 * In-app links use the paths (the anchors scroll the billing page to the packs
 * or the Pro offer); messages that leave the app (WhatsApp, the AI agent's
 * replies, emails) use the absolute URLs, which a phone turns into a link.
 */
export const BUY_CREDITS_PATH = '/settings/billing#topup-packs'
export const SUBSCRIBE_PATH = '/settings/billing#choose-plan'

export function buyCreditsUrl(): string {
  return `${getCanonicalBaseUrl()}${BUY_CREDITS_PATH}`
}

export function subscribeUrl(): string {
  return `${getCanonicalBaseUrl()}${SUBSCRIBE_PATH}`
}

/** The bot / agent sentence for a credit block, with a tappable link. */
export function creditBlockMessage(code: 'paywalled' | 'out_of_credits'): string {
  return code === 'paywalled'
    ? `Your free credits are used up — subscribe to Xtimator Pro to keep creating estimates: ${subscribeUrl()}`
    : `You're out of credits — buy credits to keep creating estimates: ${buyCreditsUrl()}`
}
