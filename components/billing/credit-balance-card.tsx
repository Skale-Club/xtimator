import Link from 'next/link'
import { CreditCard, AlertTriangle } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { T } from '@/components/i18n/t'
import { UsageProgressBar } from '@/components/billing/usage-progress-bar'
import { formatCredits } from '@/lib/billing/format-usd'
import type { LiveCreditLot, LiveCreditLotSource } from '@/lib/queries/credits'

/**
 * Owner-facing credit balance card.
 *
 * SEED-055 Phase E: credits are shown as credits (never converted to "about N
 * estimates") and split by live lot, each with its own expiry:
 *   Monthly credits   - expire at the end of the billing window
 *   Purchased credits - top-ups, expire 3 months after purchase (one row per pack)
 *   Free credits      - signup credits, never expire
 *   Adjustments       - support-granted, never expire
 * A usage bar sits above the rows when there is a valid denominator (the live
 * monthly + top-up grants); `percentUsed` is null otherwise and the bar falls
 * back to the raw balance (UsageProgressBar).
 *
 * Cardinal rule: no dollar amounts and no per-op cost math - only credits.
 *
 * `topupEligible` (Pro with a live subscription) decides whether the low-credit
 * warning points at the top-up packs or at the subscribe card.
 */

const LOT_LABEL: Record<LiveCreditLotSource, string> = {
  monthly: 'Monthly credits',
  topup: 'Purchased credits',
  signup: 'Free credits',
  adjust: 'Adjustments',
}

/** "Dec 3", or "Dec 3, 2027" when the lot outlives the current year. UTC so the
 *  date matches the Stripe period end regardless of the viewer's timezone. */
function formatExpiry(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  })
}

export function CreditBalanceCard({
  percentUsed,
  tier,
  balance,
  lots = [],
  topupEligible = true,
  hidePurchase = false,
}: {
  percentUsed: number | null
  tier: string
  balance?: number
  lots?: LiveCreditLot[]
  topupEligible?: boolean
  /** Android TWA (Google Play): no purchase links or subscribe nudges. */
  hidePurchase?: boolean
}) {
  const band =
    percentUsed === null ? 'healthy' : percentUsed >= 90 ? 'critical' : percentUsed >= 70 ? 'warning' : 'healthy'

  const resetCaption =
    tier === 'free'
      ? hidePurchase
        ? 'Free credits never expire.'
        : 'Free credits never expire. Subscribe to Pro when they run out.'
      : 'Monthly credits expire when your billing cycle renews.'

  return (
    <Card variant="glass" className="p-6">
      <CardHeader className="border-b border-[var(--glass-border)] p-0 pb-4">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 text-[hsl(var(--primary))]" />
          <div>
            <CardTitle><T>Credit balance</T></CardTitle>
            <CardDescription>
              <T>Your credits by type, and when they expire.</T>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-0 pt-4 text-sm">
        <UsageProgressBar percentUsed={percentUsed} balance={balance} label="Usage this billing cycle" />

        {lots.length > 0 && (
          <ul data-testid="credit-lots" className="divide-y divide-[var(--glass-border)]">
            {lots.map((lot, i) => (
              <li
                key={i}
                data-testid="credit-lot-row"
                data-source={lot.source}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <span className="text-foreground">
                  <T text={LOT_LABEL[lot.source]} />
                  {lot.expiresAt && (
                    <span className="block text-xs text-muted-foreground">
                      <T>Expires</T> {formatExpiry(lot.expiresAt)}
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap font-mono font-medium [font-variant-numeric:tabular-nums]">
                  {formatCredits(lot.remaining)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          <T text={resetCaption} />
        </p>

        {band !== 'healthy' && (
          <div
            data-testid="credit-low-warning"
            className={
              band === 'critical'
                ? 'flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-red-600 dark:text-red-400'
                : 'flex flex-col gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400'
            }
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">
                {band === 'critical' ? (
                  <T>You&rsquo;re almost out of credits for this cycle.</T>
                ) : (
                  <T>You&rsquo;re running low on credits for this cycle.</T>
                )}
              </p>
            </div>
            {!hidePurchase && (
            <div className="flex flex-wrap items-center gap-3">
              {topupEligible ? (
                <Link
                  href="#topup-packs"
                  className="text-sm font-medium underline underline-offset-2 hover:no-underline"
                >
                  <T>Top up now</T>
                </Link>
              ) : (
                <Link
                  href="#choose-plan"
                  className="text-sm font-medium underline underline-offset-2 hover:no-underline"
                >
                  <T>Subscribe to Pro</T>
                </Link>
              )}
            </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
