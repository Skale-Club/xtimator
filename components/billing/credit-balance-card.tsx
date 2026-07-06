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

/**
 * Phase 115 (CREDITUI-01 / CREDITUI-02) — owner-facing usage card.
 * Phase 152 (CREDITUI-03 / CREDITUI-04) — rewritten to show a color-escalating
 * usage bar instead of a raw credit count.
 * Phase 153-01 (CREDITUI-06) — the low-balance CTA no longer duplicates an
 * inline purchase button; it's a simple "Top up now" link to the always-visible
 * TopUpPacksGrid section on this same page (the full 3-card grid is too wide
 * for this inline warning banner).
 *
 * Purely presentational (server-renderable, no DB). Shows a usage percentage
 * bar for this billing cycle, a tier-aware reset caption, and — when usage is
 * in the warning (70-89%) or critical (90-100%) band — an informational
 * warning with a top-up + upgrade CTA.
 *
 * Cardinal rule: the owner sees a USAGE PERCENTAGE only — no dollar amounts,
 * no raw credit count, no per-op cost math. Enforcement is OFF this
 * milestone, so the warning copy is a heads-up nudge, never "blocked"/"denied".
 */
export function CreditBalanceCard({
  percentUsed,
  tier,
}: {
  percentUsed: number
  tier: string
}) {
  const band = percentUsed >= 90 ? 'critical' : percentUsed >= 70 ? 'warning' : 'healthy'

  const resetCaption =
    tier === 'free'
      ? 'Usage resets when you upgrade to a paid plan.'
      : 'Usage resets at the start of your next billing cycle.'

  return (
    <Card variant="glass" className="p-6">
      <CardHeader className="border-b border-[var(--glass-border)] p-0 pb-4">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 text-[hsl(var(--primary))]" />
          <div>
            <CardTitle><T>Usage</T></CardTitle>
            <CardDescription>
              <T>Your usage this billing cycle.</T>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-0 pt-4 text-sm">
        <UsageProgressBar percentUsed={percentUsed} />

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
                  <T>You&rsquo;ve nearly used up your usage for this cycle. Top up or upgrade to keep generating.</T>
                ) : (
                  <T>You&rsquo;re approaching your usage limit for this cycle.</T>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/settings/billing?topup=1#topup-packs"
                className="text-sm font-medium underline underline-offset-2 hover:no-underline"
              >
                <T>Top up now</T>
              </Link>
              <Link
                href="/settings/billing"
                className="text-sm font-medium underline underline-offset-2 hover:no-underline"
              >
                <T>Upgrade plan</T>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
