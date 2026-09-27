'use client'

import { useEffect, useState } from 'react'
import { getAttemptOutcome, getStepMedians, type AttemptOutcome } from '@/lib/actions/attempt-outcome'
import type { StepTiming } from '@/lib/estimate/progress-model'
import type { GeneratePhaseVisit } from '@/lib/estimate/generation-phases'

/** Journal read cadence while a page is watching a generation. */
export const ATTEMPT_PROGRESS_POLL_MS = 2_500

/**
 * An attempt with NO journal rows for this long is not one this page can
 * narrate (a mistyped or stale `attempt` URL param, a dispatch that never
 * happened). The page gives up on it instead of showing a checklist forever.
 */
export const ATTEMPT_PROGRESS_EMPTY_GIVE_UP_MS = 30_000

/**
 * How long a terminal `completed` outcome is held after the watched attempt
 * id goes away. The background watcher drops its entry the moment it sees
 * completion, which is also the moment the page is refreshing to show the new
 * estimate; releasing the outcome at once would let the page think nothing is
 * generating and materialize a blank estimate in the gap.
 */
export const COMPLETED_HOLD_MS = 20_000

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
  /**
   * The attempt cannot be narrated: the journal answered `unauthorized`
   * (another company's attempt), or stayed empty past
   * ATTEMPT_PROGRESS_EMPTY_GIVE_UP_MS. Polling stops; the page should drop it.
   */
  gaveUp: boolean
  /** Wall clock (ms) when a `completed` outcome was read; drives COMPLETED_HOLD_MS. */
  completedAt?: number
}

const EMPTY: AttemptProgressState = { attemptId: null, progress: null, outcome: null, gaveUp: false }

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
    const startedAt = Date.now()

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
          const empty = outcome.lastStep === null
          if (empty && Date.now() - startedAt > ATTEMPT_PROGRESS_EMPTY_GIVE_UP_MS) {
            setState({ attemptId, progress: null, outcome: null, gaveUp: true })
            return
          }
          setState({
            attemptId,
            outcome: null,
            gaveUp: false,
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
        } else if (outcome.state === 'unauthorized') {
          setState({ attemptId, progress: null, outcome: null, gaveUp: true })
          return // not this company's attempt: stop polling
        } else {
          setState((prev) => ({
            attemptId,
            progress: prev.attemptId === attemptId ? prev.progress : null,
            outcome,
            gaveUp: false,
            completedAt: Date.now(),
          }))
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

  // Hold a completed outcome briefly after its attempt id disappears (see
  // COMPLETED_HOLD_MS). `state` still carries the last attempt's outcome, so
  // the hold is a pure read of it; the timer only forces the re-render that
  // ends it. Any OTHER attempt id replaces it at once.
  // `expiredHold` names the completedAt whose hold has run out, so render
  // compares two state values and reads no clock.
  const [expiredHold, setExpiredHold] = useState<number | null>(null)
  const holdEndsAt =
    attemptId === null && state.outcome?.state === 'completed' && state.completedAt != null
      ? state.completedAt + COMPLETED_HOLD_MS
      : null
  const completedAt = state.completedAt ?? null
  useEffect(() => {
    if (holdEndsAt === null || completedAt === null) return
    const id = setTimeout(() => setExpiredHold(completedAt), Math.max(0, holdEndsAt - Date.now()))
    return () => clearTimeout(id)
  }, [holdEndsAt, completedAt])

  if (attemptId !== null) return { state: state.attemptId === attemptId ? state : EMPTY, medians }
  if (holdEndsAt !== null && expiredHold !== completedAt) return { state, medians }
  return { state: EMPTY, medians }
}
