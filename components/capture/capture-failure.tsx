'use client'
import Link from 'next/link'
import { AlertTriangle, RotateCw } from 'lucide-react'
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

const PRIMARY_STYLE = { backgroundImage: 'linear-gradient(135deg, hsl(219 92% 65%), hsl(228 84% 54%))' }
const PRIMARY_CLASS =
  'inline-flex h-14 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-base font-semibold text-white shadow-[0_10px_24px_-10px_hsl(224_86%_50%/0.8)] transition-opacity hover:opacity-90 sm:h-[50px] sm:text-[15px]'
const SECONDARY_CLASS =
  'inline-flex h-14 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-primary/10 px-5 text-[15px] font-semibold text-primary transition-colors hover:bg-primary/15 sm:h-[50px]'
const DOCK_CLASS = 'flex gap-2.5 px-4 pt-2.5 pb-1.5 sm:px-5 sm:pb-5'

// Full-width centered panel (icon, title, reason); the actions are docked at
// the bottom of the component, where the thumb is in the popup.
function FailureBody({ message, caption }: { message: string; caption?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[196px] w-full flex-1 flex-col items-center justify-center gap-1.5 px-5 py-5 text-center">
      <span
        className="mb-1.5 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-red-500/15"
        aria-hidden
      >
        <AlertTriangle className="h-[22px] w-[22px] text-red-600 dark:text-red-400" />
      </span>
      <p className="text-[17px] font-semibold leading-snug text-foreground">
        {t('Could not generate the estimate')}
      </p>
      <p className="w-full text-balance text-sm text-muted-foreground">{message}</p>
      {caption && <p className="text-[12.5px] text-muted-foreground/80">{caption}</p>}
    </div>
  )
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
      <div className="flex w-full flex-1 flex-col" data-testid="capture-failure">
        <FailureBody message={errorMessage} />
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
      <div className="flex w-full flex-1 flex-col" data-testid="capture-failure">
        <FailureBody message={errorMessage} />
        <div className={DOCK_CLASS}>
          <Link
            href={BILLING_SETTINGS_PATH}
            className={`${PRIMARY_CLASS} flex-1`}
            style={PRIMARY_STYLE}
            data-testid="capture-billing-cta"
          >
            {cta}
          </Link>
        </div>
      </div>
    )
  }
  const canRetry = !!onRetry && retriesUsed < 2
  return (
    <div className="flex w-full flex-1 flex-col" data-testid="capture-failure">
      <FailureBody
        message={errorMessage}
        // The count stays outside t() so the key stays extractable.
        caption={canRetry ? `${2 - retriesUsed} ${t('attempts left')}` : undefined}
      />
      {(canRetry || onEditManually) && (
        <div className={DOCK_CLASS}>
          {onEditManually && (
            <button
              type="button"
              onClick={onEditManually}
              className={SECONDARY_CLASS}
              data-testid="capture-edit-manually"
            >
              {t('Edit manually')}
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={`${PRIMARY_CLASS} flex-1`}
              style={PRIMARY_STYLE}
              data-testid="capture-retry"
            >
              <RotateCw className="h-[18px] w-[18px]" aria-hidden />
              {t('Retry')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
