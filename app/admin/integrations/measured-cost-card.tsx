import type { OpCostStat } from '@/lib/billing/calibration'
import { T } from '@/components/i18n/t'
import { creditsForCost, markupForCostOp, type MarkupOp } from '@/lib/billing/markup-ops'

/**
 * Read-only "measured AI cost" card for the super-admin Billing panel.
 *
 * Surfaces the REAL per-operation cost captured in ai_cost_events
 * (aggregateAiCostByOperation) right next to the config fields, and converts it
 * to CREDITS at the current markup/creditUnitUsd — so the operator sizes grants,
 * prices, and top-up packs against measured data instead of guessing.
 *
 * Empty until real generations exist (the whole point of "measure, then set").
 */
export function MeasuredCostCard({
  stats,
  markup,
  markupByOp,
  creditUnitUsd,
}: {
  stats: OpCostStat[]
  markup: number
  markupByOp?: Partial<Record<MarkupOp, number>>
  creditUnitUsd: number
}) {
  // credits charged for an op = creditsForCost (rounded, at least 1 for any cost)
  // — the exact recordCreditDebit formula, so this reads as production would bill.
  // An op that is never debited (translation) shows its credits at the global markup.
  const opMarkup = (costOp: string) => markupForCostOp({ markup, markupByOp }, costOp)
  const toCredits = (usd: number, costOp: string) =>
    creditsForCost(usd, opMarkup(costOp), creditUnitUsd)
  const fmtUsd = (usd: number) => `$${usd.toFixed(4)}`

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">
          <T>Measured AI cost (from real generations)</T>
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          <T>
            Real per-operation cost captured from the provider, converted to
            credits at the current markup. Use it to size grants, prices, and
            top-up packs. Generate a few real estimates to populate this.
          </T>
        </p>
      </div>

      {stats.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          <T>
            No measured cost yet. Run some real estimate generations (with a live
            OpenRouter key) and this fills in automatically.
          </T>
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium"><T>Operation</T></th>
                <th className="py-1.5 pr-3 font-medium text-right"><T>Samples</T></th>
                <th className="py-1.5 pr-3 font-medium text-right"><T>Mean</T></th>
                <th className="py-1.5 pr-3 font-medium text-right"><T>Median</T></th>
                <th className="py-1.5 pr-3 font-medium text-right">p90</th>
                <th className="py-1.5 font-medium text-right"><T>Mean in credits</T></th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {stats.map((s) => (
                <tr key={s.operationType} className="border-b border-border/50">
                  <td className="py-1.5 pr-3 font-sans">{s.operationType}</td>
                  <td className="py-1.5 pr-3 text-right">{s.n}</td>
                  <td className="py-1.5 pr-3 text-right">{fmtUsd(s.meanUsd)}</td>
                  <td className="py-1.5 pr-3 text-right">{fmtUsd(s.medianUsd)}</td>
                  <td className="py-1.5 pr-3 text-right">{fmtUsd(s.p90Usd)}</td>
                  <td className="py-1.5 text-right font-semibold">{toCredits(s.meanUsd, s.operationType)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            <T text={`At each operation's markup and $${creditUnitUsd}/credit, "mean in credits" is what each operation debits on average. A monthly grant of G credits ≈ G ÷ (that number) operations.`} />
          </p>
        </div>
      )}
    </div>
  )
}
