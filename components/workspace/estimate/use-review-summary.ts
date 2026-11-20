'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  REVIEW_CHANGED_EVENT,
  readResolvedQuestions,
  summarizeReview,
  type ResolvedQuestions,
  type ReviewSectionLike,
  type ReviewSummary,
} from '@/lib/estimate/review-state'

/**
 * Live review summary for one estimate: recomputes when the sections change
 * and when questions are answered or skipped (in this tab or another one).
 */
export function useReviewSummary(
  estimateId: string | null | undefined,
  sections: readonly ReviewSectionLike[],
  questions: readonly string[] | null | undefined,
): ReviewSummary & { resolved: ResolvedQuestions } {
  const [resolved, setResolved] = useState<ResolvedQuestions>({ answered: [], skipped: [] })

  useEffect(() => {
    setResolved(readResolvedQuestions(estimateId))
    if (!estimateId) return
    const refresh = () => setResolved(readResolvedQuestions(estimateId))
    const onStorage = (e: StorageEvent) => {
      if (e.key === `xtm:review:${estimateId}`) refresh()
    }
    window.addEventListener(REVIEW_CHANGED_EVENT, refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(REVIEW_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [estimateId])

  const summary = useMemo(
    () => summarizeReview({ sections, questions: questions ?? [], resolved }),
    [sections, questions, resolved],
  )
  return { ...summary, resolved }
}
