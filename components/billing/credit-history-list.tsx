import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { History, TrendingUp, TrendingDown } from 'lucide-react'
import { T } from '@/components/i18n/t'
import type { CreditHistoryRow } from '@/lib/queries/credits'
import { formatCredits } from '@/lib/billing/format-usd'
import { cn } from '@/lib/utils'

/**
 * Phase 115 (CREDITUI-01) — owner-safe credit consumption history.
 *
 * Renders the recent ledger rows from getCreditOverview as a simple list:
 * a human label (from operation_type / reason), a SIGNED delta, and the date.
 *
 * CREDITFIX-06: a v4.15 pass (CREDITUI-04) stripped the numeric delta down to
 * a bare TrendingUp/TrendingDown icon — a tenant who just paid $100 for a
 * top-up saw no evidence of it, only an up-arrow. That over-applied the
 * "never show cost math" cardinal rule: the CREDIT delta itself (not the
 * underlying real-cost/markup figure) is exactly the number the owner is
 * entitled to see — it's their own ledger. The signed CREDIT amount (e.g.
 * "+7,500" / "−12") is restored via formatCredits, with
 * font-variant-numeric: tabular-nums so the digits stay aligned column-style
 * as rows scroll. Still NEVER renders real_cost_usd / markup / balance_after —
 * those columns aren't even selected by getCreditOverview's owner-safe
 * projection (see that function's doc comment).
 */

function rowLabel(row: CreditHistoryRow): React.ReactNode {
  if (row.reason === 'grant') return <T>Monthly grant</T>
  if (row.reason === 'topup') return <T>Top-up</T>
  if (row.reason === 'adjust') return <T>Adjustment</T>
  switch (row.operation_type) {
    case 'estimate':
      return <T>Estimate</T>
    case 'photo_batch':
      return <T>Photos</T>
    case 'audio_minutes':
      return <T>Audio</T>
    case 'price_research':
      return <T>Price research</T>
    default:
      return <T>Usage</T>
  }
}

export function CreditHistoryList({ rows }: { rows: CreditHistoryRow[] }) {
  return (
    <Card variant="glass" className="p-6">
      <CardHeader className="border-b border-[var(--glass-border)] p-0 pb-4">
        <div className="flex items-start gap-3">
          <History className="mt-0.5 h-5 w-5 text-[hsl(var(--primary))]" />
          <div>
            <CardTitle><T>Recent activity</T></CardTitle>
            <CardDescription>
              <T>Your latest credit grants and usage.</T>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-0 pt-4 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground"><T>No credit activity yet.</T></p>
        ) : (
          rows.map((row, i) => {
            const positive = row.delta_credits > 0
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-3 border-b border-[var(--glass-border)] py-1.5 last:border-b-0"
              >
                <span className="text-foreground">{rowLabel(row)}</span>
                <div className="flex items-center gap-4">
                  {positive ? (
                    <TrendingUp
                      data-testid="activity-positive"
                      className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                      aria-label="Credit added"
                    />
                  ) : (
                    <TrendingDown
                      data-testid="activity-negative"
                      className="h-4 w-4 text-muted-foreground"
                      aria-label="Credit used"
                    />
                  )}
                  <span
                    data-testid="activity-delta"
                    className={cn(
                      'whitespace-nowrap font-mono text-sm font-medium [font-variant-numeric:tabular-nums]',
                      positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                    )}
                  >
                    {positive ? '+' : '−'}
                    {formatCredits(Math.abs(row.delta_credits))}
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString('en-US', {
                      dateStyle: 'medium',
                    })}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
