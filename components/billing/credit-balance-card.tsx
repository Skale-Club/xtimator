import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { T } from '@/components/i18n/t'
import { LocalizedDate } from '@/components/i18n/localized-date'
import { SettingsCard } from '@/components/settings/settings-ui'
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

const LOT_DOT: Record<LiveCreditLotSource, string> = {
  monthly: 'bg-[hsl(var(--primary))]',
  topup: 'bg-[hsl(var(--success))]',
  signup: 'bg-[hsl(var(--warning))]',
  adjust: 'bg-muted-foreground/60',
}

export function CreditBalanceCard({
  percentUsed,
  tier,
  balance,
  lots = [],
  topupEligible = true,
  hidePurchase = false,
  className,
}: {
  percentUsed: number | null
  tier: string
  balance?: number
  lots?: LiveCreditLot[]
  topupEligible?: boolean
  /** Android TWA (Google Play): no purchase links or subscribe nudges. */
  hidePurchase?: boolean
  className?: string
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
    <SettingsCard
      className={className}
      title={<T>Credit balance</T>}
      description={<T>Your credits by type, and when they expire.</T>}
      bodyClassName="space-y-5"
    >
      {/* The total first: the one number the owner came here for. */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            data-testid="credit-balance-total"
            className="text-4xl font-semibold tracking-tight [font-variant-numeric:tabular-nums]"
          >
            {formatCredits(balance ?? 0)}
          </span>
          <span className="text-sm text-muted-foreground">
            <T>credits available</T>
          </span>
        </div>
        {percentUsed !== null && (
          <UsageProgressBar percentUsed={percentUsed} balance={balance} label="Usage this billing cycle" />
        )}
      </div>

      {lots.length > 0 && (
        <ul
          data-testid="credit-lots"
          className="divide-y divide-[var(--glass-border)] rounded-[var(--radius-md)] border border-[var(--glass-border)]"
        >
          {lots.map((lot, i) => (
            <li
              key={i}
              data-testid="credit-lot-row"
              data-source={lot.source}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <span className="flex min-w-0 items-start gap-2.5">
                <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LOT_DOT[lot.source]}`} />
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">
                    <T text={LOT_LABEL[lot.source]} />
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {lot.expiresAt ? (
                      <>
                        <T>Expires</T> <LocalizedDate iso={lot.expiresAt} variant="short" utc />
                      </>
                    ) : (
                      <T>No expiry</T>
                    )}
                  </span>
                </span>
              </span>
              <span className="whitespace-nowrap font-medium [font-variant-numeric:tabular-nums]">
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
              ? 'flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-red-600 dark:text-red-400 sm:flex-row sm:items-center sm:justify-between'
              : 'flex flex-col gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400 sm:flex-row sm:items-center sm:justify-between'
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
            <Link
              href={topupEligible ? '#topup-packs' : '#choose-plan'}
              className="shrink-0 text-sm font-medium underline underline-offset-2 hover:no-underline"
            >
              {topupEligible ? <T>Top up now</T> : <T>Subscribe to Pro</T>}
            </Link>
          )}
        </div>
      )}
    </SettingsCard>
  )
}
