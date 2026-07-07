'use client'

import { Info } from 'lucide-react'

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'

interface NeedsDetailsBannerProps {
  onAddDetails: () => void
  /**
   * QUICK-psh-02: classification from projects.needs_details ('mic_test' |
   * 'too_short' | 'missing_specifics'). Absent → falls back to the original
   * generic copy (never set, or a legacy pre-QUICK-psh row).
   */
  reason?: string
  /** Specific clarifying questions, already localized by the AI call — rendered verbatim, never wrapped in t(). */
  questions?: string[]
}

/**
 * HARD-06 (web recourse UI) — recourse banner for a project stuck in
 * `awaiting_details` (a vague estimate that survived the auto-refine cap).
 *
 * Today the web adapter writes `projects.status='awaiting_details'` but nothing
 * surfaces it — a dead-end. This banner explains the estimate came out too vague
 * and offers an "Add details & regenerate" CTA that re-enters the EXISTING
 * capture/generate trigger via `onAddDetails` (the host wires it to
 * `setModePickerOpen(true)` — the same path the Record action uses). No new
 * generation path, no editor redesign — reuses the `Alert` primitive + `Button`.
 *
 * QUICK-psh-02: when projects.needs_details carries a classification, the
 * mic_test copy or the specific questions list replace the generic copy below.
 *
 * Copy is wrapped in `t()` (the English literal IS the key) so the existing
 * translation pipeline produces pt/es per the UI-SPEC.
 */
export function NeedsDetailsBanner({ onAddDetails, reason, questions }: NeedsDetailsBannerProps) {
  const { t } = useTranslation()
  const hasQuestions = !!questions && questions.length > 0

  return (
    <Alert>
      <Info />
      <AlertTitle>{t('We need a bit more detail')}</AlertTitle>
      <AlertDescription>
        {reason === 'mic_test' ? (
          <p>{t('That sounded like a mic test 🙂 Record again describing the job.')}</p>
        ) : hasQuestions ? (
          <>
            <p>{t('Almost there — a few details would make this priceable:')}</p>
            <ul className="list-disc space-y-1 pl-5 mt-1">
              {questions!.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>
            {t(
              "The estimate came out too vague. Add more about the job — materials, measurements, scope — and we'll rebuild it."
            )}
          </p>
        )}
        <Button size="sm" className="mt-2" onClick={onAddDetails}>
          {t('Add details & regenerate')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
