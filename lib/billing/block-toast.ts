'use client'

import { toast } from 'sonner'
import {
  BILLING_SETTINGS_PATH,
  isBillingBlockCode,
  type BillingBlockCode,
} from '@/lib/billing/block-codes'
import { TWA_OUT_OF_CREDITS_COPY, readTwaCookieClient } from '@/lib/pwa/twa-signal'

type Translate = (key: string) => string
type RouterLike = { push: (href: string) => void }

/**
 * State-specific copy for a billing block. Shared by the toast below and by
 * UpgradeModal (402 from the AI routes) so both surfaces always agree.
 * Paywalled -> subscribe; out of credits -> buy credits. Deliberately says
 * nothing about building manually: with enforcement on, nothing new can be
 * created without credits.
 */
export function billingBlockCopy(code: BillingBlockCode, t: Translate) {
  // Android TWA (Google Play): purchase-free mode - neutral copy, no CTA.
  if (readTwaCookieClient()) {
    return {
      title: t("You're out of credits"),
      description: t(TWA_OUT_OF_CREDITS_COPY),
      cta: null as string | null,
    }
  }
  if (code === 'out_of_credits') {
    return {
      title: t("You're out of credits"),
      description: t('Buy credits to keep creating estimates.'),
      cta: t('Buy credits') as string | null,
    }
  }
  return {
    title: t('Your free credits are used up'),
    description: t('Subscribe to Xtimator Pro to keep creating estimates.'),
    cta: t('Subscribe') as string | null,
  }
}

/**
 * Show the standard billing-block toast for a gated server action's `code`.
 * Returns true when `code` was a billing block (so a caller can skip its own
 * generic error toast), false otherwise.
 */
export function showBillingBlockToast(
  code: unknown,
  router: RouterLike,
  t: Translate
): boolean {
  if (!isBillingBlockCode(code)) return false
  const copy = billingBlockCopy(code, t)
  toast.error(copy.title, {
    id: `billing-block-${code}`,
    description: copy.description,
    duration: 9000,
    ...(copy.cta
      ? { action: { label: copy.cta, onClick: () => router.push(BILLING_SETTINGS_PATH) } }
      : {}),
  })
  return true
}
