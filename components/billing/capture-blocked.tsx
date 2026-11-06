'use client'

import Link from 'next/link'
import { CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { BILLING_SETTINGS_PATH, type BillingBlockCode } from '@/lib/billing/block-codes'

/**
 * SEED-055 Phase D: full-screen block rendered by the (capture) layout in place
 * of the recording UI when the company is paywalled / out of credits. Capture is
 * pure creation, so there is nothing useful to show (and no "do it by hand"
 * escape hatch - nothing new can be created without credits).
 */
export function CaptureBlocked({
  state,
  priceLabel,
}: {
  state: BillingBlockCode
  priceLabel: string
}) {
  const { t } = useTranslation()
  const paywalled = state === 'paywalled'

  return (
    <div
      data-testid="capture-blocked"
      data-state={state}
      className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CreditCard className="h-7 w-7" />
      </div>
      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-semibold">
          {paywalled ? t('Your free credits are used up') : t("You're out of credits")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {paywalled
            ? t('Subscribe to Xtimator Pro — {price}/mo to keep creating estimates.').replace(
                '{price}',
                priceLabel
              )
            : t('Buy credits to keep creating estimates.')}
        </p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Button asChild size="lg">
          <Link href={BILLING_SETTINGS_PATH}>{paywalled ? t('Subscribe') : t('Buy credits')}</Link>
        </Button>
        <Link href="/dashboard" className="text-sm text-muted-foreground underline underline-offset-2">
          {t('Back to dashboard')}
        </Link>
      </div>
    </div>
  )
}
