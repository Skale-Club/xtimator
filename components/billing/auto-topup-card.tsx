import { RefreshCw, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { T } from '@/components/i18n/t'
import { AutoTopupDialogLauncher } from '@/components/billing/auto-topup-dialog'

/**
 * Phase 153 Plan 03 (CREDITUI-07) — Settings > Plans auto-top-up card.
 *
 * Server component. Rendered by the caller ONLY when
 * billing_config.autoTopupEnabled is true (the platform kill switch) — this
 * component itself does not re-check the switch, it trusts the caller's gate.
 * Renders as one row (no card chrome of its own): the billing page places it
 * inside the "Add credits" card, under the packs it buys from.
 */
export function AutoTopupCard({
  enabled,
  packAmount,
  thresholdAmount,
  paymentMethodLabel,
  lastFailed,
  packs,
  currentThresholdCredits,
  currentPackIndex,
  isOwner = true,
}: {
  enabled: boolean
  packAmount: string | null
  thresholdAmount: string | null
  paymentMethodLabel: string | null
  lastFailed: boolean
  packs: Array<{ priceCents: number; credits: number }>
  currentThresholdCredits: number | null
  currentPackIndex: number | null
  // False when the signed-in user is a company member, not the owner —
  // defaults to true so existing callers keep today's behavior.
  isOwner?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
            <RefreshCw className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <T>Auto top-up</T>
              {enabled && (
                <Badge variant="brand"><T>On</T></Badge>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {enabled && packAmount && thresholdAmount ? (
                <T
                  text="We'll add {amount} when your balance drops below {threshold} credits."
                  values={{ amount: packAmount, threshold: thresholdAmount }}
                />
              ) : (
                <T>Never run out mid-job. Turn on auto top-up to automatically add credits when your balance gets low.</T>
              )}
            </p>
            {enabled && paymentMethodLabel && (
              <p className="text-xs text-muted-foreground">{paymentMethodLabel}</p>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <AutoTopupDialogLauncher
            enabled={enabled}
            packs={packs}
            currentThresholdCredits={currentThresholdCredits}
            currentPackIndex={currentPackIndex}
            hasPaymentMethod={!!paymentMethodLabel}
            isOwner={isOwner}
          />
        </div>
      </div>
      {lastFailed && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle><T>Auto-top-up failed &mdash; update your payment method to keep it active.</T></AlertTitle>
        </Alert>
      )}
    </div>
  )
}
