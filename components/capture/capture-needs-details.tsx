'use client'
import { MessageCircleQuestionMark } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'

export interface CaptureNeedsDetailsProps {
  /**
   * AI-classified reason ('mic_test' | 'too_short' | 'missing_specifics') from
   * lib/ai/needs-details.ts, read via projects.needs_details. Absent when the
   * enrichment read missed (stale attempt_id / read failure) — falls back to
   * `fallbackMessage`.
   */
  reason?: string
  /**
   * Specific clarifying questions, already localized in the estimate language
   * by the AI call — rendered verbatim, never wrapped in t(). Empty/absent for
   * the 'mic_test' reason (the UI copy alone carries that message).
   */
  questions?: string[]
  /** Plain, already-t()'d fallback copy used when reason/questions are both absent. */
  fallbackMessage: string
  /** Panel only: the "Record again" button is rendered when this is passed. */
  onRecordAgain?: () => void
  /**
   * 'panel' (default) is the centered panel of the popup's awaiting_details
   * outcome. 'inline' is a compact card that sits above the text box, so the
   * questions stay visible while the person answers.
   */
  variant?: 'panel' | 'inline'
}

/**
 * QUICK-psh-02 — compact panel replacing the generic "too vague" toast in the
 * popup's awaiting_details outcome. Mirrors CaptureFailure's structure/styling
 * (sibling surface, same call site in capture-recorder.tsx).
 */
export function CaptureNeedsDetails({
  reason,
  questions,
  fallbackMessage,
  onRecordAgain,
  variant = 'panel',
}: CaptureNeedsDetailsProps) {
  const { t } = useTranslation()
  const hasQuestions = !!questions && questions.length > 0

  if (variant === 'inline') {
    return (
      <div className="flex flex-col gap-1.5 rounded-2xl bg-primary/10 p-3.5 text-sm" data-testid="capture-needs-details">
        <p className="flex items-center gap-2 text-sm font-semibold leading-snug text-primary">
          <MessageCircleQuestionMark className="h-[18px] w-[18px] shrink-0" aria-hidden />
          {t('A few details are missing to price this')}
        </p>
        {reason === 'mic_test' ? (
          <p className="text-muted-foreground">
            {t('That sounded like a mic test 🙂 Record again describing the job.')}
          </p>
        ) : hasQuestions ? (
          <ul className="list-disc space-y-0.5 pl-5 text-foreground">
            {questions!.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{fallbackMessage}</p>
        )}
      </div>
    )
  }

  return (
    // Centered like CaptureFailure; the question list stays left-aligned in a
    // tinted box so multi-line questions read naturally.
    <div className="flex w-full flex-col items-center gap-3 px-5 py-5 text-center" data-testid="capture-needs-details">
      <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-primary/10" aria-hidden>
        <MessageCircleQuestionMark className="h-[22px] w-[22px] text-primary" />
      </span>
      {reason === 'mic_test' ? (
        <p className="text-sm text-muted-foreground">
          {t('That sounded like a mic test 🙂 Record again describing the job.')}
        </p>
      ) : hasQuestions ? (
        <div className="w-full space-y-2">
          <p className="text-sm text-muted-foreground">
            {t('Almost there — a few details would make this priceable:')}
          </p>
          <ul className="list-disc space-y-1 rounded-2xl bg-primary/10 py-2.5 pl-8 pr-3 text-left text-sm text-foreground">
            {questions!.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{fallbackMessage}</p>
      )}
      {onRecordAgain && (
        <button
          type="button"
          onClick={onRecordAgain}
          className="inline-flex h-14 w-full items-center justify-center rounded-full px-5 text-base font-semibold text-white shadow-[0_10px_24px_-10px_hsl(224_86%_50%/0.8)] transition-opacity hover:opacity-90 sm:h-[50px] sm:text-[15px]"
          style={{ backgroundImage: 'linear-gradient(135deg, hsl(219 92% 65%), hsl(228 84% 54%))' }}
          data-testid="capture-needs-details-record-again"
        >
          {t('Record again')}
        </button>
      )}
    </div>
  )
}
