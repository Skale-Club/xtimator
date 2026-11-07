'use client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { BILLING_SETTINGS_PATH, type BillingBlockCode } from '@/lib/billing/block-codes'
import { useIsTwa } from '@/components/pwa/twa-provider'

export interface CaptureFailureProps {
  /**
   * Already-friendly, already-t()'d reason string. The state→message mapping
   * lives at the capture-recorder call site (Plan 02) using inline t() ternaries;
   * this component just renders the friendly string (never a raw status code).
   */
  errorMessage: string
  retriesUsed: number    // capped at 2 per D-14
  onRetry?: () => void
  onEditManually?: () => void
  /**
   * SEED-055 Phase D: set when the failure is a credits / paywall block
   * ('credits' = the journal said "insufficient credits" without saying which
   * wall). Retrying or building by hand cannot get past that wall, so both
   * fallbacks are hidden and a billing CTA is shown instead. Genuine AI
   * failures leave this undefined and keep Retry / Edit manually.
   */
  billingBlock?: BillingBlockCode | 'credits'
}

export function CaptureFailure({
  errorMessage,
  retriesUsed,
  onRetry,
  onEditManually,
  billingBlock,
}: CaptureFailureProps) {
  const { t } = useTranslation()
  const isTwa = useIsTwa()
  if (billingBlock && isTwa) {
    // Android TWA: no purchase CTA; the error message itself stays.
    return (
      <div className="space-y-3" data-testid="capture-failure">
        <p className="text-sm text-destructive">{errorMessage}</p>
      </div>
    )
  }
  if (billingBlock) {
    const cta =
      billingBlock === 'paywalled'
        ? t('Subscribe')
        : billingBlock === 'out_of_credits'
          ? t('Buy credits')
          : t('Open billing')
    return (
      <div className="space-y-3" data-testid="capture-failure">
        <p className="text-sm text-destructive">{errorMessage}</p>
        <Button asChild size="sm">
          <Link href={BILLING_SETTINGS_PATH} data-testid="capture-billing-cta">
            {cta}
          </Link>
        </Button>
      </div>
    )
  }
  const canRetry = !!onRetry && retriesUsed < 2
  return (
    <div className="space-y-3" data-testid="capture-failure">
      <p className="text-sm text-destructive">{errorMessage}</p>
      <div className="flex gap-2">
        {canRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} data-testid="capture-retry">
            {/* Keep the literal at the call site for the i18n extractor; the
                ({n} left) count stays outside t() so the key stays extractable. */}
            {t('Retry')} ({2 - retriesUsed} left)
          </Button>
        )}
        {onEditManually && (
          <Button variant="default" size="sm" onClick={onEditManually} data-testid="capture-edit-manually">
            {t('Edit manually')}
          </Button>
        )}
      </div>
    </div>
  )
}
