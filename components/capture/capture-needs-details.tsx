'use client'
import { MessageCircleQuestionMark } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  onRecordAgain: () => void
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
}: CaptureNeedsDetailsProps) {
  const { t } = useTranslation()
  const hasQuestions = !!questions && questions.length > 0

  return (
    // Centered like CaptureFailure; the question list stays left-aligned in a
    // muted box so multi-line questions read naturally.
    <div className="flex flex-col items-center gap-3 text-center" data-testid="capture-needs-details">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10" aria-hidden>
        <MessageCircleQuestionMark className="h-5 w-5 text-primary" />
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
          <ul className="list-disc space-y-1 rounded-lg bg-muted/40 py-2.5 pl-8 pr-3 text-left text-sm text-foreground">
            {questions!.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{fallbackMessage}</p>
      )}
      <Button
        variant="default"
        size="sm"
        onClick={onRecordAgain}
        data-testid="capture-needs-details-record-again"
      >
        {t('Record again')}
      </Button>
    </div>
  )
}
