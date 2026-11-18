'use client'

import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OwnerEstimateReview } from '@/lib/estimate/owner-review'
import { useTranslation } from '@/lib/i18n/use-translation'

interface OwnerReviewSummaryProps {
  review: OwnerEstimateReview | null
  onReview?: () => void
}

export function OwnerReviewSummary({ review, onReview }: OwnerReviewSummaryProps) {
  const { t } = useTranslation()
  if (!review) return null

  return (
    <details className="group rounded-lg border bg-card text-sm text-card-foreground">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        {t('Review before sending')}
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t px-4 py-3">
        <p className="text-muted-foreground">
          {t('Questions, assumptions, and confidence flags come from the generated draft.')}
        </p>
        {(review.lowConfidenceLines > 0 || review.unpricedLines > 0) && (
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {review.lowConfidenceLines > 0 && (
              <li>{t('Low-confidence items')} <span className="font-semibold tabular-nums">{review.lowConfidenceLines}</span></li>
            )}
            {review.unpricedLines > 0 && (
              <li>{t('Items without a price')} <span className="font-semibold tabular-nums">{review.unpricedLines}</span></li>
            )}
          </ul>
        )}
        {review.questions.length > 0 && (
          <section>
            <h3 className="font-medium">{t('Open questions')}</h3>
            <ul className="mt-1 list-disc space-y-1 break-words pl-5">
              {review.questions.map((question, index) => <li key={`${index}:${question}`}>{question}</li>)}
            </ul>
          </section>
        )}
        {review.assumptions.length > 0 && (
          <section>
            <h3 className="font-medium">{t('Assumptions')}</h3>
            <ul className="mt-1 list-disc space-y-1 break-words pl-5">
              {review.assumptions.map((assumption, index) => <li key={`${index}:${assumption}`}>{assumption}</li>)}
            </ul>
          </section>
        )}
        <p className="text-muted-foreground">{t('Check the current estimate and make any needed changes before sending.')}</p>
        {onReview && (
          <Button type="button" variant="outline" size="sm" onClick={onReview}>{t('Edit with AI')}</Button>
        )}
      </div>
    </details>
  )
}
