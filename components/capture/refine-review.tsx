'use client'

import { Button } from '@/components/ui/button'
import { LoadingDots } from '@/components/ui/loading-dots'
import { formatCurrency } from '@/lib/utils/format'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { RefineDiff } from '@/lib/estimate/refine-merge'

interface RefineReviewProps {
  diff: RefineDiff
  currencyCode: string
  applying?: boolean
  onApply: () => void
  onDiscard: () => void
}

/**
 * Review step of "Edit with AI": what the refinement would change, before
 * anything is applied. Computed by mergeRefinement, the same merge the reducer
 * uses on Apply, so what is shown here is what lands.
 */
export function RefineReview({ diff, currencyCode, applying = false, onApply, onDiscard }: RefineReviewProps) {
  const { t } = useTranslation()
  const money = (v: number) => formatCurrency(v, currencyCode)
  const fieldLabels: string[] = []
  if (diff.fields.summary) fieldLabels.push(t('Summary'))
  if (diff.fields.notes) fieldLabels.push(t('Notes'))
  if (diff.fields.timeline) fieldLabels.push(t('Timeline'))
  if (diff.fields.payment_terms) fieldLabels.push(t('Payment terms'))
  if (diff.fields.warranty_terms) fieldLabels.push(t('Warranty terms'))
  const empty =
    diff.changed.length === 0 && diff.added.length === 0 && diff.removed.length === 0 && fieldLabels.length === 0

  return (
    <div className="flex flex-1 min-h-0 flex-col" data-testid="refine-review">
      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        <p className="text-muted-foreground">
          {t('Review what the AI would change in the current estimate. Nothing is applied until you confirm.')}
        </p>
        {empty && <p data-testid="refine-review-empty">{t('The AI found nothing to change.')}</p>}

        {diff.changed.length > 0 && (
          <section data-testid="refine-review-changed">
            <h3 className="mb-1 font-medium">{t('Changed')} ({diff.changed.length})</h3>
            <ul className="space-y-1.5">
              {diff.changed.map((c, i) => (
                <li key={`${c.description}-${i}`} className="rounded-md border px-3 py-2">
                  <div className="font-medium">{c.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.oldPrice !== c.newPrice && (
                      <span>
                        {t('Price')}: {money(c.oldPrice)} {'→'} {money(c.newPrice)}
                      </span>
                    )}
                    {c.oldPrice !== c.newPrice && c.oldQty !== c.newQty && <span> · </span>}
                    {c.oldQty !== c.newQty && (
                      <span>
                        {t('Quantity')}: {c.oldQty} {'→'} {c.newQty}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {diff.added.length > 0 && (
          <section data-testid="refine-review-added">
            <h3 className="mb-1 font-medium text-emerald-700 dark:text-emerald-300">
              {t('Added')} ({diff.added.length})
            </h3>
            <ul className="space-y-1">
              {diff.added.map((a, i) => (
                <li key={`${a.description}-${i}`} className="flex justify-between gap-3 rounded-md bg-emerald-500/10 px-3 py-1.5">
                  <span>{a.description}</span>
                  <span className="shrink-0">{money(a.unit_price)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {diff.removed.length > 0 && (
          <section data-testid="refine-review-removed">
            <h3 className="mb-1 font-medium text-red-700 dark:text-red-300">
              {t('Removed')} ({diff.removed.length})
            </h3>
            <ul className="space-y-1">
              {diff.removed.map((r, i) => (
                <li key={`${r.description}-${i}`} className="rounded-md bg-red-500/10 px-3 py-1.5 line-through">
                  {r.description}
                </li>
              ))}
            </ul>
          </section>
        )}

        {fieldLabels.length > 0 && (
          <section data-testid="refine-review-fields">
            <h3 className="mb-1 font-medium">{t('Also updated')}</h3>
            <p>{fieldLabels.join(', ')}</p>
            {diff.fields.summary && (
              <p className="mt-1 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {diff.fields.summary.new}
              </p>
            )}
          </section>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
        <Button variant="ghost" onClick={onDiscard} disabled={applying} data-testid="refine-discard-btn">
          {t('Discard')}
        </Button>
        <Button onClick={onApply} disabled={applying} data-testid="refine-apply-btn">
          {applying ? <LoadingDots /> : t('Apply')}
        </Button>
      </div>
    </div>
  )
}
