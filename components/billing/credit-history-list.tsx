import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { T } from '@/components/i18n/t'
import { LocalizedDate } from '@/components/i18n/localized-date'
import { SettingsCard } from '@/components/settings/settings-ui'
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
  // SEED-055: a lot lapsed (monthly window ended / top-up aged out).
  if (row.reason === 'expire') return <T>Expired</T>
  switch (row.operation_type) {
    case 'estimate':
      return <T>Estimate</T>
    case 'photo_batch':
      return <T>Photos</T>
    case 'audio_minutes':
      return <T>Audio</T>
    case 'price_research':
      return <T>Price research</T>
    case 'chat':
      return <T>Xtimator AI chat</T>
    // Phase 2b: WhatsApp / SMS / email sent for the company, ONE aggregated line
    // per debit run (never one line, or a price, per message).
    case 'messaging':
      return <T>Messages</T>
    default:
      return <T>Usage</T>
  }
}

export function CreditHistoryList({
  rows,
  className,
  fillHeight = false,
}: {
  rows: CreditHistoryRow[]
  className?: string
  /** On wide screens, take the height of the row (the card beside it) and
   *  scroll inside it, instead of setting the row height itself. */
  fillHeight?: boolean
}) {
  return (
    <SettingsCard
      className={className}
      title={<T>Recent activity</T>}
      description={<T>Your latest credit grants and usage.</T>}
      bodyClassName={cn('p-0 sm:p-0', fillHeight && 'lg:relative lg:min-h-[16rem] lg:flex-1')}
    >
      {rows.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted-foreground sm:px-6"><T>No credit activity yet.</T></p>
      ) : (
        // Up to 50 rows come back: scroll inside the card instead of
        // stretching the page (and the balance card beside it).
        <ul
          className={cn(
            'max-h-[26rem] divide-y divide-[var(--glass-border)] overflow-y-auto',
            fillHeight && 'lg:absolute lg:inset-0 lg:max-h-none'
          )}
        >
          {rows.map((row, i) => {
            const positive = row.delta_credits > 0
            return (
              <li key={i} className="flex items-center gap-3 px-5 py-3 text-sm sm:px-6">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    positive
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-[var(--glass-bg-light)] text-muted-foreground'
                  )}
                >
                  {positive ? (
                    <ArrowDownLeft data-testid="activity-positive" className="h-4 w-4" aria-label="Credit added" />
                  ) : (
                    <ArrowUpRight data-testid="activity-negative" className="h-4 w-4" aria-label="Credit used" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{rowLabel(row)}</span>
                  <span className="block text-xs text-muted-foreground">
                    <LocalizedDate iso={row.created_at} />
                  </span>
                </span>
                <span
                  data-testid="activity-delta"
                  className={cn(
                    'whitespace-nowrap font-medium [font-variant-numeric:tabular-nums]',
                    positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                  )}
                >
                  {positive ? '+' : '−'}
                  {formatCredits(Math.abs(row.delta_credits))}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </SettingsCard>
  )
}
