/**
 * 260707-hhp (P1 client half / Wave 2): DB-truth outcome watcher for the
 * dispatch-and-watch capture rewire. Once a path dispatches its server-side
 * chain (startRecordingPipeline / createTextRecording autoGenerateEstimate /
 * analyze-photos autoGenerateEstimate), the client no longer orchestrates the
 * remaining steps — it only WATCHES the database for the outcome. This makes
 * the browser disposable: closing the tab / locking the phone can no longer
 * orphan a generation, because the server-side chain (Plan 01) owns it.
 *
 * Client-safe (imports the browser Supabase client) — usable from
 * components/capture/capture-recorder.tsx.
 */
import { createClient } from '@/lib/supabase/client'

export type EstimateOutcome =
  | { state: 'completed'; estimateId: string }
  | { state: 'awaiting_details' }
  | { state: 'timeout' }

/**
 * Pure decision core — exported for tests. `previousEstimateId` distinguishes
 * a NEW current estimate (created by THIS attempt's dispatch) from one that
 * already existed before dispatch (e.g. an edit-mode rerun where a current
 * estimate already exists) — only a genuinely new id counts as completion.
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
 * Polls the DATABASE (never a job/queue) for the outcome of a dispatched
 * generation chain. Every `intervalMs`, reads the project's current estimate
 * + status and runs `evaluateOutcomeTick`; a non-null result ends the loop.
 * Individual query errors (flaky mobile network) are swallowed — a failed
 * tick is simply skipped, retried on the next interval. Only an aborted
 * signal or `timeoutMs` elapsing end the loop early.
 */
export async function pollEstimateOutcome(opts: {
  projectId: string
  previousEstimateId: string | null
  signal: AbortSignal
  /** Default 6 minutes. */
  timeoutMs?: number
  /** Default 2.5 seconds. */
  intervalMs?: number
  /** Fires ONCE when the recording's transcript lands (stage progression). */
  recordingId?: string
  onTranscriptReady?: () => void
}): Promise<EstimateOutcome> {
  const {
    projectId,
    previousEstimateId,
    signal,
    timeoutMs = 6 * 60_000,
    intervalMs = 2_500,
    recordingId,
    onTranscriptReady,
  } = opts
  const startedAt = Date.now()
  let transcriptFired = false

  while (true) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (Date.now() - startedAt > timeoutMs) return { state: 'timeout' }

    try {
      const supabase = createClient()
      const shouldCheckTranscript = !!recordingId && !!onTranscriptReady && !transcriptFired

      const [estRes, projRes, transRes] = await Promise.all([
        supabase
          .from('estimates')
          .select('id')
          .eq('project_id', projectId)
          .eq('is_current', true)
          .maybeSingle(),
        supabase.from('projects').select('status').eq('id', projectId).maybeSingle(),
        shouldCheckTranscript
          ? supabase.from('recordings').select('transcript').eq('id', recordingId!).maybeSingle()
          : Promise.resolve(null),
      ])

      const currentEstimateId = (estRes.data as { id?: string } | null)?.id ?? null
      const projectStatus = (projRes.data as { status?: string } | null)?.status ?? null

      const outcome = evaluateOutcomeTick({ currentEstimateId, projectStatus, previousEstimateId })
      if (outcome) return outcome

      if (shouldCheckTranscript && transRes) {
        const transcript = ((transRes.data as { transcript?: string | null } | null)?.transcript ?? '').trim()
        if (transcript) {
          transcriptFired = true
          onTranscriptReady?.()
        }
      }
    } catch {
      // Transient network error (mobile cell handoff) — skip this tick, retry next interval.
    }

    await abortableSleep(intervalMs, signal)
  }
}
