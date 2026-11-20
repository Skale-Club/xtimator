'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAppTranslation } from '@/lib/i18n/use-translation'
import { buildChecklist } from '@/lib/estimate/progress-model'
import type { GenerationStatus } from '@/components/workspace/generation-status-context'
import { remainingLine, rowLabels } from './processing-narration'

export interface GenerationSnapshot {
  /** 0..1 */
  fraction: number
  /** Short, for the chip: "~3 min", "<1 min", or null when overdue. */
  shortRemaining: string | null
  /** Full sentence for the tooltip and screen readers. */
  detail: string
}

/** Where a new version's generation stands, recomputed every second. */
export function useGenerationSnapshot(status: GenerationStatus): GenerationSnapshot {
  const { t } = useAppTranslation()
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [])

  const { mode, progress, medians } = status
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
  const shortRemaining =
    remaining.kind === 'overdue' ? null : remaining.kind === 'under_a_minute' ? '<1 min' : `~${remaining.minutes} min`

  return {
    fraction: snapshot.fraction,
    shortRemaining,
    detail: [t('Generating a new version of this estimate'), active ? t(rowLabels(active.id, mode).ongoing) : null, remainingText]
      .filter(Boolean)
      .join(' · '),
  }
}

/**
 * Notices review stage 1, part 2: a new version generating over the current
 * estimate is a chip in the top bar, not a box above the document. The full
 * sentence (step and time left) is the chip's tooltip and accessible name.
 */
export function GenerationChip({ snapshot }: { snapshot: GenerationSnapshot }) {
  const { t } = useAppTranslation()
  return (
    <span
      role="status"
      aria-label={snapshot.detail}
      title={snapshot.detail}
      data-testid="generation-chip"
      className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary/10 px-2.5 text-[12.5px] font-medium text-primary"
    >
      <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" />
      {/* Phones: the time left is enough next to the spinner (the line under
          the bar says it is progress); the row also holds the status chip. */}
      <span className={snapshot.shortRemaining ? 'max-sm:hidden' : undefined}>{t('New version')}</span>
      {snapshot.shortRemaining && (
        <span className="tabular-nums sm:opacity-80">
          <span className="max-sm:hidden">· </span>
          {snapshot.shortRemaining}
        </span>
      )}
    </span>
  )
}

/** 2px line along the bottom edge of the top bar. */
export function GenerationProgressLine({ fraction }: { fraction: number }) {
  return (
    <div
      aria-hidden
      data-testid="generation-progress-line"
      className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden"
    >
      <div
        className="h-full bg-primary transition-[width] duration-500 ease-out"
        style={{ width: `${Math.round(fraction * 1000) / 10}%` }}
      />
    </div>
  )
}
