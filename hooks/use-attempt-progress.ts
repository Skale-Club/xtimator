'use client'

import { useEffect, useState } from 'react'
import { getAttemptOutcome, getStepMedians, type AttemptOutcome } from '@/lib/actions/attempt-outcome'
import type { StepTiming } from '@/lib/estimate/progress-model'
import type { GeneratePhaseVisit } from '@/lib/estimate/generation-phases'

/** Journal read cadence while a page is watching a generation. */
export const ATTEMPT_PROGRESS_POLL_MS = 2_500

export interface AttemptProgressSnapshot {
  completedSteps: string[]
  activeStep: string | null
  activeStepStartedAt: string | null
  stepTimings?: StepTiming[]
  phaseVisits?: GeneratePhaseVisit[]
  analyzedCount?: number
  totalCount?: number
  failedCount?: number
}

export type AttemptTerminal = Exclude<AttemptOutcome, { state: 'pending' } | { state: 'unauthorized' }>

export interface AttemptProgressState {
  /** The attempt this state belongs to (stale state for another attempt is ignored). */
  attemptId: string | null
  progress: AttemptProgressSnapshot | null
  /** Set once the journal reports a terminal outcome; polling stops there. */
  outcome: AttemptTerminal | null
}

const EMPTY: AttemptProgressState = { attemptId: null, progress: null, outcome: null }

/**
 * Watches one generation attempt through the journal, for pages that show the
 * capture checklist outside the capture popup (the project's estimate tab).
 *
 * Reads getAttemptOutcome every ATTEMPT_PROGRESS_POLL_MS until a terminal
 * outcome, and the live medians once. Read failures are skipped and retried
 * on the next tick; the server's own watchdog turns a stuck run into a
 * `failed` outcome, so this never needs a clock of its own to give up.
 */
export function useAttemptProgress(attemptId: string | null): {
  state: AttemptProgressState
  medians: Record<string, number> | undefined
} {
  const [state, setState] = useState<AttemptProgressState>(EMPTY)
  const [medians, setMedians] = useState<Record<string, number> | undefined>(undefined)

  useEffect(() => {
    if (!attemptId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    void getStepMedians()
      .then((m) => {
        if (!cancelled) setMedians(m)
      })
      .catch(() => {})

    const tick = async () => {
      try {
        const outcome = await getAttemptOutcome(attemptId)
        if (cancelled) return
        if (outcome.state === 'pending') {
          setState({
            attemptId,
            outcome: null,
            progress: {
              completedSteps: outcome.completedSteps,
              activeStep:
                outcome.lastStep && !outcome.completedSteps.includes(outcome.lastStep)
                  ? outcome.lastStep
                  : null,
              activeStepStartedAt: outcome.activeStepStartedAt,
              stepTimings: outcome.stepTimings,
              phaseVisits: outcome.phaseVisits,
              analyzedCount: outcome.analyzedCount,
              totalCount: outcome.totalCount,
              failedCount: outcome.failedCount,
            },
          })
        } else if (outcome.state !== 'unauthorized') {
          setState((prev) => ({ attemptId, progress: prev.attemptId === attemptId ? prev.progress : null, outcome }))
          return // terminal: stop polling
        }
      } catch {
        // Transient read failure: try again next tick.
      }
      if (!cancelled) timer = setTimeout(() => void tick(), ATTEMPT_PROGRESS_POLL_MS)
    }
    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [attemptId])

  return { state: state.attemptId === attemptId ? state : EMPTY, medians }
}
