'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAppTranslation } from '@/lib/i18n/use-translation'
import { buildChecklist, type CaptureProgressMode } from '@/lib/estimate/progress-model'
import type { AttemptProgressSnapshot } from '@/hooks/use-attempt-progress'
import { remainingLine, rowLabels } from './processing-narration'

export interface GenerationProgressBannerProps {
  mode: CaptureProgressMode
  progress: AttemptProgressSnapshot | null
  medians?: Record<string, number>
}

/**
 * One-line version of the capture checklist, for a project that already shows
 * an estimate while a NEW version generates (the "add details" flow). The full
 * checklist would push the current estimate off screen; this says what is
 * happening, how far along, and roughly how long is left.
 */
export function GenerationProgressBanner({ mode, progress, medians }: GenerationProgressBannerProps) {
  const { t } = useAppTranslation()
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [])

  const snapshot = buildChecklist({
    mode,
    done: false,
    completedSteps: progress?.completedSteps ?? [],
    activeStep: progress?.activeStep ?? null,
    activeStepStartedAt: progress?.activeStepStartedAt ?? null,
    stepTimings: progress?.stepTimings,
    phaseVisits: progress?.phaseVisits,
    medians,
    nowMs,
  })
  const active = snapshot.rows.find((r) => r.state === 'active')
  const remaining = remainingLine(snapshot.remainingMs, snapshot.overdue)
  const remainingText =
    remaining.kind === 'overdue'
      ? t('Bigger job than usual, still working on it')
      : remaining.kind === 'under_a_minute'
        ? t('Less than a minute left')
        : `${t('About')} ${remaining.minutes} ${t('min left')}`

  return (
    <div
      className="mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5"
      data-testid="generation-progress-banner"
      role="status"
    >
      {/* Two lines (headline, then step + time left) rather than one
          nowrap row: the single row was wider than a phone, so the time left
          was cut off and the long line widened the whole page. */}
      <div className="flex items-start gap-2">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">
            {t('Generating a new version of this estimate')}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {active && (
              <>
                {t(rowLabels(active.id, mode).ongoing)}
                {' · '}
              </>
            )}
            {remainingText}
          </p>
        </div>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${Math.round(snapshot.fraction * 1000) / 10}%` }}
        />
      </div>
    </div>
  )
}
