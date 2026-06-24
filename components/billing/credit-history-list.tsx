import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { History } from 'lucide-react'
import { T } from '@/components/i18n/t'
import type { CreditHistoryRow } from '@/lib/queries/credits'

/**
 * Phase 115 (CREDITUI-01) — owner-safe credit consumption history.
 *
 * Renders the recent ledger rows from getCreditOverview as a simple list:
 * a human label (from operation_type / reason), a SIGNED delta, and the date.
 *
 * Cardinal rule: NEVER renders real_cost_usd / markup / balance_after — they are
 * not even present on CreditHistoryRow (the Plan-01 owner-safe projection never
 * selected them). The owner sees credits consumed, never the cost math.
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
                  <span
                    className={`font-mono font-medium tabular-nums ${
                      positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                    }`}
                  >
                    {positive ? '+' : ''}
                    {row.delta_credits.toLocaleString()}
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
