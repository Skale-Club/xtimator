/**
 * 260707-hhp (P2): cron watchdog — a backstop for the generation pipeline.
 * P1 (this same quick task) makes the server own the transcribe→generate
 * chain end-to-end, removing the client-death drop points that caused every
 * observed production loss. This cron catches whatever P1 doesn't (e.g. an
 * Inngest outage, a dropped event): every 10 minutes it scans pipeline_attempts
 * for attempts with no terminal progress in STUCK_AFTER_MS, marks each as
 * failed with errorCode 'watchdog_timeout', and alerts ops via Telegram.
 *
 * DELIBERATE NON-GOAL: this watchdog does NOT auto-redispatch a stuck attempt.
 * Re-dispatch risks double-charging the tenant and pollutes the attempt's
 * event timeline with a second in-flight run. Instead, the owner gets a
 * Telegram alert and the app already has a manual retry-transcription button
 * (260521-jx9).
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import {
  recordPipelineEvent,
  type PipelineInputType,
  type PipelineStep,
} from '@/lib/observability/pipeline-events'
import { notifyOps } from '@/lib/observability/ops-alert'

type ServiceClientLike = ReturnType<typeof requireServiceClient>

export const STUCK_AFTER_MS = 15 * 60 * 1000
export const SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Pure + exported for tests: an attempt's LAST event decides its fate.
 *   - 'failed'  → the latest event is a failed row (onFailure/early-return
 *                 already alerted; nothing further to do here)
 *   - 'done'    → the latest event succeeded on a terminal step
 *                 (generate_estimate or preview_redirect — pipeline finished)
 *   - 'pending' → anything else — still in flight, or stalled on a
 *                 non-terminal step (save_recording/transcribe/analyze)
 */
export function classifyLastEvent(e: {
  step: string
  status: string
}): 'done' | 'failed' | 'pending' {
  if (e.status === 'failed') return 'failed'
  if (
    e.status === 'succeeded' &&
    (e.step === 'generate_estimate' || e.step === 'preview_redirect')
  ) {
    return 'done'
  }
  return 'pending'
}

interface PipelineAttemptRow {
  attempt_id: string
  last_at: string
  company_id: string | null
  project_id: string | null
  user_id: string | null
  input_type: string | null
}

interface PipelineEventRow {
  step: string
  status: string
}

export interface SweepResult {
  candidates: number
  marked: number
}

/**
 * Extracted sweep body — injectable deps (svc, now) so it's testable without
 * standing up the Inngest step-run harness. The Inngest fn below is a thin
 * wrapper that supplies the real service client + Date.now().
 */
export async function sweepStuckAttempts(deps: {
  svc: ServiceClientLike
  now: number
}): Promise<SweepResult> {
  const { svc, now } = deps
  const stuckBefore = new Date(now - STUCK_AFTER_MS).toISOString()
  const windowAfter = new Date(now - SWEEP_WINDOW_MS).toISOString()

  const { data: attemptRows } = await svc
    .from('pipeline_attempts')
    .select('attempt_id, last_at, company_id, project_id, user_id, input_type')
    .lt('last_at', stuckBefore)
    .gt('last_at', windowAfter)
    .order('last_at', { ascending: false })
    .limit(50)

  const candidates = (attemptRows ?? []) as PipelineAttemptRow[]
  let marked = 0

  for (const attempt of candidates) {
    const { data: latestRows } = await svc
      .from('pipeline_events')
      .select('step, status')
      .eq('attempt_id', attempt.attempt_id)
      .order('created_at', { ascending: false })
      .limit(1)
    const latest = ((latestRows ?? [])[0] ?? null) as PipelineEventRow | null
    if (!latest) continue

    if (classifyLastEvent(latest) !== 'pending') continue

    // Skip attempts the watchdog has already flagged (idempotent across runs).
    const { count: alreadyMarked } = await svc
      .from('pipeline_events')
      .select('id', { count: 'exact', head: true })
      .eq('attempt_id', attempt.attempt_id)
      .eq('error_code', 'watchdog_timeout')
    if ((alreadyMarked ?? 0) > 0) continue

    const minutes = Math.round((now - new Date(attempt.last_at).getTime()) / 60000)

    void recordPipelineEvent({
      attemptId: attempt.attempt_id,
      inputType: (attempt.input_type as PipelineInputType) ?? 'recording',
      step: latest.step as PipelineStep,
      status: 'failed',
      companyId: attempt.company_id,
      projectId: attempt.project_id,
      userId: attempt.user_id,
      errorCode: 'watchdog_timeout',
      errorMessage: `No terminal progress ${minutes}min after last event (last: ${latest.step}/${latest.status}) — attempt presumed dead (client leg died or a dispatched event was dropped).`,
      provider: null,
    })

    void notifyOps({
      kind: 'pipeline_stuck',
      title: 'Generation attempt stuck',
      message: `attempt=${attempt.attempt_id} company=${attempt.company_id ?? 'unknown'} project=${attempt.project_id ?? 'unknown'} stalled at ${latest.step} for ${minutes}min`,
      severity: 'warning',
      dedupeKey: `watchdog:${attempt.attempt_id}`,
      suppressWindowSec: 86400,
    })

    marked += 1
  }

  return { candidates: candidates.length, marked }
}

export const pipelineWatchdogJob = inngest.createFunction(
  { id: 'pipeline-watchdog', retries: 0, triggers: [{ cron: '*/10 * * * *' }] },
  async ({ step }) => {
    return step.run('sweep', async () => {
      const svc = requireServiceClient()
      return sweepStuckAttempts({ svc, now: Date.now() })
    })
  }
)
