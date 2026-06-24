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
import { TopUpButton } from '@/components/billing/top-up-button'

/**
 * Phase 115 (CREDITUI-01 / CREDITUI-02) — owner-facing credit balance card.
 *
 * Purely presentational (server-renderable, no DB). Shows the remaining credit
 * balance, a STATIC per-action guidance line, and — when the balance is at/below
 * the highest configured low-balance threshold — an INFORMATIONAL warning with a
 * top-up + upgrade CTA.
 *
 * Cardinal rule: the owner sees CREDITS, never the underlying token/USD cost
 * math — no dollar amounts, no "markup", no "token". Enforcement is OFF this
 * milestone, so the warning copy is a heads-up nudge, never "blocked"/"denied".
 *
 * The guidance range ("an estimate uses about 10–15 credits") is a STATIC string
 * locked to SEED-035 phrasing — it is NOT computed from config (fake precision
 * before the Phase-116 calibration). Additive to the count-based "Usage This
 * Month" card (MIG-01 parallel run).
 */
export function CreditBalanceCard({
  balance,
  lowBalanceThresholds,
}: {
  balance: number
  lowBalanceThresholds: number[]
}) {
  const isLow =
    lowBalanceThresholds.length > 0 && balance <= Math.max(...lowBalanceThresholds)

  return (
    <Card variant="glass" className="p-6">
      <CardHeader className="border-b border-[var(--glass-border)] p-0 pb-4">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 text-[hsl(var(--primary))]" />
          <div>
            <CardTitle><T>Credits</T></CardTitle>
            <CardDescription>
              <T>Your remaining AI credits this cycle.</T>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-0 pt-4 text-sm">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-medium">
            {balance.toLocaleString()}
          </span>
          <span className="text-muted-foreground"><T>credits</T></span>
        </div>

        <p className="text-xs text-muted-foreground">
          <T>Roughly speaking, an estimate uses about 10&ndash;15 credits.</T>
        </p>

        {isLow && (
          <div
            data-testid="credit-low-warning"
            className="flex flex-col gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">
                <T>You&rsquo;re running low on credits. Top up to keep generating.</T>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/settings/billing?topup=1">
                <TopUpButton packIndex={0} />
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
