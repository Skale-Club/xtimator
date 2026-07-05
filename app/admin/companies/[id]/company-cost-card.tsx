import type { CompanyCostOverview } from '@/lib/queries/admin-company-cost'
import { T } from '@/components/i18n/t'

/**
 * Phase 152 (CREDITUI-05) — super-admin-only per-company cost card.
 *
 * Mirrors MeasuredCostCard's table shape (Operation/Samples/Mean/Median/p90)
 * but scoped to exactly ONE company_id, plus a summary row showing the exact
 * credit balance, total real USD cost, and effective markup — the three
 * figures this requirement exists to surface. Rendered as the 4th card on
 * the admin company detail page, gated by that page's existing
 * requireAdmin() call. Never import this component from any tenant-facing
 * route.
 */
export function CompanyCostCard({ overview }: { overview: CompanyCostOverview }) {
  const { creditBalance, totalRealCostUsd, markup, perOperation } = overview
  const fmtUsd = (usd: number) => `$${usd.toFixed(4)}`

  return (
    <div>
      <div>
        <h2 className="text-lg font-medium">
          <T>Cost & Billing</T>
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          <T>
            Real USD cost, markup, and current balance for this company. Not visible to the tenant.
          </T>
        </p>
      </div>

      <div className="rounded-md border bg-muted/20 px-4 py-3 text-xs space-y-1 mt-4">
        <div>
          <span className="text-muted-foreground">
            <T>Credit balance:</T>
          </span>{' '}
          <span className="font-mono">{creditBalance}</span>
        </div>
        <div>
          <span className="text-muted-foreground">
            <T>Total real cost:</T>
          </span>{' '}
          <span className="font-mono">{fmtUsd(totalRealCostUsd)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">
            <T>Effective markup:</T>
          </span>{' '}
          <span className="font-mono">{markup}x</span>
        </div>
      </div>

      {perOperation.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground mt-4">
          <T>No measured cost yet for this company.</T>
        </p>
      ) : (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">
                  <T>Operation</T>
                </th>
                <th className="py-1.5 pr-3 font-medium text-right">
                  <T>Samples</T>
                </th>
                <th className="py-1.5 pr-3 font-medium text-right">
                  <T>Mean</T>
                </th>
                <th className="py-1.5 pr-3 font-medium text-right">
                  <T>Median</T>
                </th>
                <th className="py-1.5 font-medium text-right">p90</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {perOperation.map((s) => (
                <tr key={s.operationType} className="border-b border-border/50">
                  <td className="py-1.5 pr-3 font-sans">{s.operationType}</td>
                  <td className="py-1.5 pr-3 text-right">{s.n}</td>
                  <td className="py-1.5 pr-3 text-right">{fmtUsd(s.meanUsd)}</td>
                  <td className="py-1.5 pr-3 text-right">{fmtUsd(s.medianUsd)}</td>
                  <td className="py-1.5 text-right">{fmtUsd(s.p90Usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
