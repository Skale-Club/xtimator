'use client'

import { MessageCircleQuestionMark, Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import { MAX_OWNER_QUESTIONS } from '@/lib/estimate/question-limits'

/** True when no line has a description or a price yet (a blank estimate). */
export function estimateIsBlank(estimate: Pick<EstimateWithSections, 'sections'>): boolean {
  return !estimate.sections.some((section) =>
    section.items.some((item) => (item.description ?? '').trim() !== '' || Number(item.unit_price ?? 0) > 0),
  )
}

const SKIP_KEY = (projectId: string) => `xtm:needs-details-skip:${projectId}`

/** What "Fill it in myself" remembered for this project (a signature of the questions), if anything. */
export function readNeedsDetailsSkip(projectId: string): string | null {
  try {
    return window.localStorage.getItem(SKIP_KEY(projectId))
  } catch {
    return null
  }
}

export function writeNeedsDetailsSkip(projectId: string, signature: string): void {
  try {
    window.localStorage.setItem(SKIP_KEY(projectId), signature)
  } catch {
    // Blocked storage: the empty state may show again next visit.
  }
}

interface NeedsDetailsEmptyStateProps {
  /** projects.needs_details.reason: 'mic_test' | 'too_short' | 'missing_specifics'. */
  reason?: string
  /** Already in the estimate language (written by the AI): rendered verbatim. */
  questions?: string[]
  /** Opens New Xtimate on this project with the questions above the text box. */
  onAnswer: () => void
  /** Leaves the AI aside and shows the blank estimate to fill by hand. */
  onFillMyself?: () => void
}

/**
 * Notices review stage 1, part 2 (2026-11-20): a project waiting for details
 * with nothing on its estimate gets this as the page's main content, centred,
 * instead of an alert in the corner of an empty document (the old
 * NeedsDetailsBanner, HARD-06). The AI's questions are numbered; the one
 * action answers them and generates.
 */
export function NeedsDetailsEmptyState({ reason, questions, onAnswer, onFillMyself }: NeedsDetailsEmptyStateProps) {
  const { t } = useTranslation()
  const list = (questions ?? []).filter((q) => q.trim() !== '').slice(0, MAX_OWNER_QUESTIONS)
  const micTest = reason === 'mic_test'
  const hasQuestions = !micTest && list.length > 0

  const title = hasQuestions ? t('Almost there') : t('We need a bit more detail')
  const lead = micTest
    ? t('That sounded like a mic test 🙂 Record again describing the job.')
    : hasQuestions
      ? t('Answer these and the AI builds the estimate.')
      : t("The estimate came out too vague. Add more about the job (materials, measurements, scope) and we'll rebuild it.")
  const cta = micTest ? t('Record again') : hasQuestions ? t('Answer and generate') : t('Add details and generate')

  return (
    <section
      data-testid="needs-details-empty-state"
      aria-labelledby="needs-details-title"
      className="mx-auto flex w-full max-w-[480px] flex-col items-center py-8 text-center sm:py-14"
    >
      <span aria-hidden className="grid size-12 place-items-center rounded-full bg-primary/10">
        <MessageCircleQuestionMark className="size-6 text-primary" />
      </span>
      <h2 id="needs-details-title" className="mt-4 text-[19px] font-bold leading-tight tracking-tight sm:text-xl">
        {title}
      </h2>
      <p className="mt-1.5 max-w-[400px] text-[14px] leading-relaxed text-muted-foreground">{lead}</p>

      {hasQuestions && (
        <ol className="mt-6 w-full space-y-2 text-left" data-testid="needs-details-questions">
          {list.map((q, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-[14px] leading-snug text-foreground"
            >
              <span
                aria-hidden
                className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[12px] font-bold tabular-nums text-primary"
              >
                {i + 1}
              </span>
              <span className="min-w-0 pt-[3px]">{q}</span>
            </li>
          ))}
        </ol>
      )}

      <Button
        type="button"
        onClick={onAnswer}
        data-testid="needs-details-answer"
        className="mt-6 h-[50px] w-full gap-2 rounded-full px-7 text-[15px] font-semibold sm:w-auto"
      >
        <Mic size={18} aria-hidden />
        {cta}
      </Button>
      {onFillMyself && (
        <button
          type="button"
          onClick={onFillMyself}
          data-testid="needs-details-fill-myself"
          className="mt-3 min-h-10 px-3 text-[13.5px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {t('Fill it in myself')}
        </button>
      )}
    </section>
  )
}
