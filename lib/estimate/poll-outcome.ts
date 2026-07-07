/**
 * 260707-hhp (P1 client half / Wave 2): DB-truth outcome watcher for the
 * dispatch-and-watch capture rewire. Once a path dispatches its server-side
 * chain (startRecordingPipeline / createTextRecording autoGenerateEstimate /
 * analyze-photos autoGenerateEstimate), the client no longer orchestrates the
 * remaining steps — it only WATCHES for the outcome. This makes the browser
 * disposable: closing the tab / locking the phone can no longer orphan a
 * generation, because the server-side chain (Plan 01) owns it.
 *
 * 260707-lyq (P4 Wave 2): journal-first. Production evidence (attempt
 * 8a0c13e8, 2026-07-07 19:45 UTC) showed the plain DB-truth poll below can be
 * fooled by a ghost estimate — a transient row that a later auto-refine step
 * deletes. When `attemptId` is supplied, each tick reads the journal FIRST
 * via `getAttemptOutcome` (lib/actions/attempt-outcome.ts, Wave 1) — the only
 * source that can tell "succeeded, durably" apart from "succeeded, then
 * vanished":
 *   - completed / needs_details / failed are journal-authoritative and end
 *     the poll immediately (failed surfaces the server's REAL error_message
 *     within ~1 tick instead of waiting out the 6-minute timeout).
 *   - pending fires `onStageProgress(lastStep)` (stage progression now comes
 *     from the journal, not a separate recordings/transcript query) and
 *     falls through to the estimates/projects fallback below — belt-and-
 *     braces for a journal-read failure.
 *   - unauthorized (a scoping edge, e.g. a stale claims read) is treated as
 *     pending — it must never fail the UI.
 * The fallback's own `awaiting_details` branch is SKIPPED when `attemptId` is
 * present: it's a known stale-status false positive (a project row left at
 * status='awaiting_details' from a PRIOR attempt would otherwise fire
 * immediately on a brand-new, still-pending retry) — the journal owns vague
 * detection now. The fallback's `completed` branch (a genuinely new current
 * estimate id) still stays as belt-and-braces.
 *
 * Client-safe (imports the browser Supabase client) — usable from
 * components/capture/capture-recorder.tsx. `getAttemptOutcome` is a server
 * action; calling it from this client module is the intended Next.js pattern.
 */
import { createClient } from '@/lib/supabase/client'
import { getAttemptOutcome } from '@/lib/actions/attempt-outcome'

export type EstimateOutcome =
  | { state: 'completed'; estimateId: string }
  | { state: 'awaiting_details' }
  | { state: 'failed'; step: string; reason: string }
  | { state: 'timeout' }

/**
 * 260707-o7a: journal-derived progress payload forwarded on every `pending`
 * tick — drives the REAL progress bar (lib/estimate/progress-model.ts).
 */
export interface StageProgress {
  /** Step of the last journal row (started OR succeeded), null before any row. */
  lastStep: string | null
  /** Steps with a `succeeded` event, in journal order. */
  completedSteps: string[]
  /** created_at of the latest `started` event without a matching `succeeded`. */
  activeStepStartedAt: string | null
}

/**
 * Pure decision core — exported for tests. `previousEstimateId` distinguishes
 * a NEW current estimate (created by THIS attempt's dispatch) from one that
 * already existed before dispatch (e.g. an edit-mode rerun where a current
 * estimate already exists) — only a genuinely new id counts as completion.
 *
 * Used ONLY as the fallback path's decision core (see module doc) — never
 * itself produces a `failed` outcome (that only comes from the journal).
 */
export function evaluateOutcomeTick(input: {
  currentEstimateId: string | null
  projectStatus: string | null
  previousEstimateId: string | null
}): EstimateOutcome | null {
  if (input.currentEstimateId && input.currentEstimateId !== input.previousEstimateId) {
    return { state: 'completed', estimateId: input.currentEstimateId }
  }
  if (input.projectStatus === 'awaiting_details') return { state: 'awaiting_details' }
  return null
}

/** Single-shot read of the project's current estimate id (or null). Used to
 * capture the pre-dispatch baseline that `evaluateOutcomeTick` compares against. */
export async function getCurrentEstimateId(projectId: string): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('estimates')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

/** Abort-aware sleep — rejects with a DOMException named 'AbortError' on
 * signal abort, matching pollJob's (hooks/use-job-status.ts) convention. */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Polls for the outcome of a dispatched generation chain. Every `intervalMs`:
 * when `attemptId` is supplied, reads the journal FIRST (see module doc) —
 * otherwise (or on a journal `pending`/`unauthorized`) falls through to the
 * DB-truth estimates/projects check. Individual tick errors (flaky mobile
 * network) are swallowed — a failed tick is simply skipped, retried on the
 * next interval. Only an aborted signal or `timeoutMs` elapsing end the loop
 * early (-> `{ state: 'timeout' }`).
 */
export async function pollEstimateOutcome(opts: {
  projectId: string
  previousEstimateId: string | null
  signal: AbortSignal
  /** Default 6 minutes. */
  timeoutMs?: number
  /** Default 2.5 seconds. */
  intervalMs?: number
  /**
   * 260707-lyq (P4): when supplied, each tick reads `getAttemptOutcome`
   * FIRST — completed/needs_details/failed are journal-authoritative and end
   * the poll immediately; pending/unauthorized fall through to the fallback
   * below (see module doc for the full precedence + stale-status rationale).
   */
  attemptId?: string
  /**
   * Fires on every tick the journal read comes back `pending`, with the
   * journal-derived {@link StageProgress} payload (lastStep for stage
   * progression + completedSteps/activeStepStartedAt for the real progress
   * bar) — stage progression derives from this instead of a separate
   * recordings/transcript query.
   */
  onStageProgress?: (progress: StageProgress) => void
}): Promise<EstimateOutcome> {
  const {
    projectId,
    previousEstimateId,
    signal,
    timeoutMs = 6 * 60_000,
    intervalMs = 2_500,
    attemptId,
    onStageProgress,
  } = opts
  const startedAt = Date.now()

  while (true) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (Date.now() - startedAt > timeoutMs) return { state: 'timeout' }

    try {
      if (attemptId) {
        const attemptOutcome = await getAttemptOutcome(attemptId)
        if (attemptOutcome.state === 'completed') {
          return { state: 'completed', estimateId: attemptOutcome.estimateId }
        }
        if (attemptOutcome.state === 'needs_details') {
          return { state: 'awaiting_details' }
        }
        if (attemptOutcome.state === 'failed') {
          return { state: 'failed', step: attemptOutcome.step, reason: attemptOutcome.reason }
        }
        if (attemptOutcome.state === 'pending') {
          onStageProgress?.({
            lastStep: attemptOutcome.lastStep,
            completedSteps: attemptOutcome.completedSteps,
            activeStepStartedAt: attemptOutcome.activeStepStartedAt,
          })
        }
        // 'unauthorized' — a scoping edge (e.g. a stale claims read); never
        // fail the UI on it. Falls through silently to the DB-truth check.
      }

      const supabase = createClient()
      const [estRes, projRes] = await Promise.all([
        supabase
          .from('estimates')
          .select('id')
          .eq('project_id', projectId)
          .eq('is_current', true)
          .maybeSingle(),
        supabase.from('projects').select('status').eq('id', projectId).maybeSingle(),
      ])

      const currentEstimateId = (estRes.data as { id?: string } | null)?.id ?? null
      const projectStatus = (projRes.data as { status?: string } | null)?.status ?? null

      const outcome = evaluateOutcomeTick({ currentEstimateId, projectStatus, previousEstimateId })
      // The fallback's own `awaiting_details` branch is a known stale-status
      // false positive once a journal is in play (see module doc) — skip it
      // when attemptId is present. Its `completed` branch (genuinely new
      // current estimate id) still stays as belt-and-braces either way.
      if (outcome && !(attemptId && outcome.state === 'awaiting_details')) {
        return outcome
      }
    } catch {
      // Transient network error (mobile cell handoff) — skip this tick, retry next interval.
    }

    await abortableSleep(intervalMs, signal)
  }
}
