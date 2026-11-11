'use client'

import Link from 'next/link'
import { AlertTriangle, CreditCard } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { BILLING_SETTINGS_PATH, type BillingBlockCode } from '@/lib/billing/block-codes'
import { useIsTwa } from '@/components/pwa/twa-provider'
import { TWA_OUT_OF_CREDITS_COPY } from '@/lib/pwa/twa-signal'

/**
 * SEED-055 Phase D: persistent, NON-dismissable top banner for a company whose
 * credits are gone. Rendered from the (app) layout only when the access state is
 * not `active`.
 *   paywalled       strong banner + Subscribe (the app is read-only)
 *   out_of_credits  softer banner + Buy credits (editing still works)
 * `priceLabel` is the Pro monthly price formatted from billing_config (e.g.
 * "$29"), never hard-coded here.
 */
export function PaywallBanner({
  state,
  priceLabel,
}: {
  state: BillingBlockCode
  priceLabel: string
}) {
  const { t } = useTranslation()
  const isTwa = useIsTwa()

  // Android TWA (Google Play): no price, no CTA, no link - plain neutral note.
  if (isTwa) {
    return (
      <div
        role="status"
        data-testid="paywall-banner"
        data-state={state}
        data-twa="true"
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400"
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t(TWA_OUT_OF_CREDITS_COPY)}
        </span>
      </div>
    )
  }

  if (state === 'out_of_credits') {
    return (
      <div
        role="status"
        data-testid="paywall-banner"
        data-state="out_of_credits"
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400"
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t("You're out of credits")}
        </span>
        <Link
          href={BILLING_SETTINGS_PATH}
          className="font-semibold underline underline-offset-2 hover:no-underline"
        >
          {t('Buy credits')}
        </Link>
      </div>
    )
  }

  const message = t(
    'Your free credits are used up. Subscribe to Xtimator Pro — {price}/mo'
  ).replace('{price}', priceLabel)

  return (
    <div
      role="alert"
      data-testid="paywall-banner"
      data-state="paywalled"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      <span className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 shrink-0" />
        {message}
      </span>
      <Link
        href={BILLING_SETTINGS_PATH}
        className="inline-flex min-h-10 items-center rounded-md bg-destructive px-3 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90"
      >
        {t('Subscribe')}
      </Link>
    </div>
  )
}
