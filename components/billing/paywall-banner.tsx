'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { BILLING_SETTINGS_PATH, type BillingWallCode } from '@/lib/billing/block-codes'
import { useIsTwa } from '@/components/pwa/twa-provider'
import { TWA_OUT_OF_CREDITS_COPY } from '@/lib/pwa/twa-signal'
import { openBuyCredits } from '@/components/billing/buy-credits'

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
  logoUrl,
  appName,
}: {
  state: BillingWallCode
  priceLabel: string
  /** Platform branding, the same logo the sidebar shows. */
  logoUrl?: string | null
  appName?: string
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
        className="flex items-center gap-3 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-sm md:px-6"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <p className="min-w-0 flex-1 leading-snug">
          <span className="font-semibold text-foreground">{t("You're out of credits")}</span>
          <span className="hidden text-muted-foreground md:inline">
            {'. '}
            {t('Buy a pack to keep creating estimates. Your estimates stay editable.')}
          </span>
        </p>
        {/* Credits plan 2026-11-20: opens the buy dialog right here. */}
        <button
          type="button"
          onClick={() => openBuyCredits()}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary px-3.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t('Buy credits')}
        </button>
      </div>
    )
  }

  // Redesign 2026-11-20: an invitation in the app's own brand (logo, primary
  // tint, one primary button), not a red error strip. One line on every width:
  // phones get the short price line, wider screens the full sentence.
  const offer = t('Subscribe to Xtimator Pro — {price}/mo to keep creating estimates.').replace(
    '{price}',
    priceLabel
  )
  const shortOffer = t('Xtimator Pro — {price}/mo').replace('{price}', priceLabel)

  return (
    <div
      role="alert"
      data-testid="paywall-banner"
      data-state="paywalled"
      className="flex items-center gap-3 border-b border-primary/25 bg-primary/10 px-4 py-2.5 text-sm md:px-6"
    >
      <BrandMark logoUrl={logoUrl} appName={appName} />
      <p className="min-w-0 flex-1 leading-snug">
        <span className="font-semibold text-foreground">{t('Your free credits are used up')}</span>
        <span className="hidden text-muted-foreground md:inline">
          {'. '}
          {offer}
        </span>
        <span className="block text-xs text-muted-foreground md:hidden">{shortOffer}</span>
      </p>
      <Link
        href={`${BILLING_SETTINGS_PATH}#choose-plan`}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-primary px-3.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <span className="md:hidden">{t('Subscribe')}</span>
        <span className="hidden md:inline">{t('Subscribe to Pro')}</span>
        <ArrowRight className="hidden h-4 w-4 md:block" aria-hidden />
      </Link>
    </div>
  )
}

/** The platform logo (same source as the sidebar), or its initial. */
function BrandMark({ logoUrl, appName }: { logoUrl?: string | null; appName?: string }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" aria-hidden className="h-6 w-6 shrink-0 object-contain" />
  }
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-xs font-semibold text-primary-foreground"
    >
      {(appName || 'Xtimator').charAt(0).toUpperCase()}
    </span>
  )
}
