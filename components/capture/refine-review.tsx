'use client'

import { Check } from 'lucide-react'
import { LoadingDots } from '@/components/ui/loading-dots'
import { formatCurrency } from '@/lib/utils/format'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { RefineDiff } from '@/lib/estimate/refine-merge'

interface RefineReviewProps {
  diff: RefineDiff
  currencyCode: string
  /** Before/after of the estimate's money; omitted when it cannot be compared. */
  totals?: { before: number; after: number; label: 'total' | 'subtotal' }
  applying?: boolean
  onApply: () => void
  onDiscard: () => void
}

const MARKER_BASE = 'flex h-[22px] w-[22px] items-center justify-center rounded-[7px] text-sm font-bold leading-none'
const ROW = 'grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-2.5 border-t border-border py-2.5 text-[14.5px]'

/**
 * Review step of "Edit with AI": what the refinement would change, before
 * anything is applied. Computed by mergeRefinement, the same merge the reducer
 * uses on Apply, so what is shown here is what lands.
 */
export function RefineReview({ diff, currencyCode, totals, applying = false, onApply, onDiscard }: RefineReviewProps) {
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
  const hasRows = diff.changed.length + diff.added.length + diff.removed.length > 0

  const delta = totals ? Math.round((totals.after - totals.before) * 100) / 100 : 0
  const deltaText = `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${money(Math.abs(delta))}`

  // Only the very first row has no top rule; later groups continue the list.
  let rowIndex = 0
  const rowClass = () => (rowIndex++ === 0 ? `${ROW} border-t-0` : ROW)

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="refine-review">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-1.5 pb-1 text-sm">
        <p className="text-[13px] text-muted-foreground">{t('Nothing is applied until you confirm.')}</p>
        {empty && <p data-testid="refine-review-empty">{t('The AI found nothing to change.')}</p>}

        {totals && (
          <div
            className="flex shrink-0 items-center gap-2.5 rounded-[14px] bg-primary/10 px-3.5 py-3 text-[13px] text-muted-foreground"
            data-testid="refine-review-totals"
          >
            <span>{totals.label === 'total' ? t('Total') : t('Subtotal')}</span>
            <b className="ml-auto whitespace-nowrap text-[17px] font-semibold tabular-nums text-foreground">
              <s className="mr-1.5 text-sm font-normal text-muted-foreground/70">{money(totals.before)}</s>
              {money(totals.after)}
            </b>
            {delta !== 0 && (
              <em className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold not-italic tabular-nums text-primary">
                {deltaText}
              </em>
            )}
          </div>
        )}

        {hasRows && (
          <div role="list" className="flex flex-col">
            {diff.changed.length > 0 && (
              <div className="contents" data-testid="refine-review-changed">
                {diff.changed.map((c, i) => {
                  const priceChanged = c.oldPrice !== c.newPrice
                  const qtyChanged = c.oldQty !== c.newQty
                  return (
                    <div role="listitem" key={`${c.description}-${i}`} className={rowClass()}>
                      <span className={`${MARKER_BASE} bg-primary/10 text-primary`} aria-hidden>
                        →
                      </span>
                      <div className="min-w-0">
                        <b className="block break-words font-medium">{c.description}</b>
                        <small className="block text-[12.5px] text-muted-foreground">
                          {t('Changed')}
                          {priceChanged && (
                            <span>
                              {' · '}
                              {t('Price')}: {money(c.oldPrice)} {'→'} {money(c.newPrice)}
                            </span>
                          )}
                          {qtyChanged && (
                            <span>
                              {' · '}
                              {t('Quantity')}: {c.oldQty} {'→'} {c.newQty}
                            </span>
                          )}
                        </small>
                      </div>
                      {priceChanged && (
                        <em className="whitespace-nowrap text-right text-[13.5px] not-italic tabular-nums">
                          <s className="block text-[12.5px] text-muted-foreground/70">{money(c.oldPrice)}</s>
                          {money(c.newPrice)}
                        </em>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {diff.added.length > 0 && (
              <div className="contents" data-testid="refine-review-added">
                {diff.added.map((a, i) => (
                  <div role="listitem" key={`${a.description}-${i}`} className={rowClass()}>
                    <span
                      className={`${MARKER_BASE} bg-emerald-500/15 text-emerald-600 dark:text-emerald-400`}
                      aria-hidden
                    >
                      +
                    </span>
                    <div className="min-w-0">
                      <b className="block break-words font-medium">{a.description}</b>
                      <small className="block text-[12.5px] text-muted-foreground">{t('Added')}</small>
                    </div>
                    <em className="whitespace-nowrap text-right text-[13.5px] not-italic tabular-nums">
                      {money(a.unit_price)}
                    </em>
                  </div>
                ))}
              </div>
            )}

            {diff.removed.length > 0 && (
              <div className="contents" data-testid="refine-review-removed">
                {diff.removed.map((r, i) => (
                  <div role="listitem" key={`${r.description}-${i}`} className={rowClass()}>
                    <span className={`${MARKER_BASE} bg-red-500/15 text-red-600 dark:text-red-400`} aria-hidden>
                      −
                    </span>
                    <div className="min-w-0">
                      <b className="block break-words font-medium text-muted-foreground line-through">
                        {r.description}
                      </b>
                      <small className="block text-[12.5px] text-muted-foreground">{t('Removed')}</small>
                    </div>
                    <span />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {fieldLabels.length > 0 && (
          <div data-testid="refine-review-fields">
            <p className="text-[13px] text-muted-foreground">
              {t('Also updated')}: <b className="font-medium text-foreground">{fieldLabels.join(', ')}</b>
            </p>
            {diff.fields.summary && (
              <p className="mt-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs text-muted-foreground">
                {diff.fields.summary.new}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 gap-2.5 px-4 pt-2.5 pb-4 sm:px-5 sm:pb-5">
        <button
          type="button"
          onClick={onDiscard}
          disabled={applying}
          className="inline-flex h-14 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-primary/10 px-5 text-[15px] font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50 sm:h-[50px]"
          data-testid="refine-discard-btn"
        >
          {t('Discard')}
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="inline-flex h-14 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-base font-semibold text-white shadow-[0_10px_24px_-10px_hsl(224_86%_50%/0.8)] transition-opacity hover:opacity-90 disabled:opacity-60 sm:h-[50px] sm:text-[15px]"
          style={{ backgroundImage: 'linear-gradient(135deg, hsl(219 92% 65%), hsl(228 84% 54%))' }}
          data-testid="refine-apply-btn"
        >
          {applying ? (
            <LoadingDots />
          ) : (
            <>
              <Check className="h-[18px] w-[18px]" aria-hidden />
              {t('Apply changes')}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
