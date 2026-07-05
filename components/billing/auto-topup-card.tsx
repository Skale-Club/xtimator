import { RefreshCw, AlertTriangle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '@/components/ui/card'
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
 * Mirrors credit-balance-card.tsx's Card shell (glass variant, icon +
 * CardTitle/CardDescription header, CardContent body).
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
}: {
  enabled: boolean
  packAmount: string | null
  thresholdAmount: string | null
  paymentMethodLabel: string | null
  lastFailed: boolean
  packs: Array<{ priceCents: number; credits: number }>
  currentThresholdCredits: number | null
  currentPackIndex: number | null
}) {
  return (
    <Card variant="glass" className="p-6">
      <CardHeader className="border-b border-[var(--glass-border)] p-0 pb-4">
        <div className="flex items-start gap-3">
          <RefreshCw className="mt-0.5 h-5 w-5 text-[hsl(var(--primary))]" />
          <div>
            <CardTitle><T>Auto top-up</T></CardTitle>
            <CardDescription>
              {enabled && packAmount && thresholdAmount ? (
                <T text={`Auto top-up is enabled. We'll add ${packAmount} when your balance drops below ${thresholdAmount}.`} />
              ) : (
                <T>Never run out mid-job. Turn on auto top-up to automatically add credits when your balance gets low.</T>
              )}
            </CardDescription>
          </div>
        </div>
        {enabled && (
          <CardAction>
            <Badge variant="brand"><T>On</T></Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3 px-0 pt-4 text-sm">
        {lastFailed && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle><T>Auto-top-up failed &mdash; update your payment method to keep it active.</T></AlertTitle>
          </Alert>
        )}
        {enabled && paymentMethodLabel && (
          <p className="text-xs text-muted-foreground">{paymentMethodLabel}</p>
        )}
        <AutoTopupDialogLauncher
          enabled={enabled}
          packs={packs}
          currentThresholdCredits={currentThresholdCredits}
          currentPackIndex={currentPackIndex}
          hasPaymentMethod={!!paymentMethodLabel}
        />
      </CardContent>
    </Card>
  )
}
