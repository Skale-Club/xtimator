/**
 * Phase 92 — Pipeline event helper (Wave 1 implementation).
 *
 * A single best-effort `recordPipelineEvent()` every instrumentation site calls.
 * It maps the camelCase {@link PipelineEventInput} to the snake_case D-02 row,
 * computes `retry_count`, and writes via `requireServiceClient()` (RLS-bypassing,
 * service-role only — never the browser client) — wrapped in try/catch so it
 * NEVER throws or rejects the caller (D-06).
 *
 * Design notes:
 *  - D-02: only safe metadata columns are accepted. No raw audio, transcripts,
 *    or API keys ever land in this table.
 *  - D-06 (best-effort): a logging failure must never fail or alter the user's
 *    pipeline. On any error we `console.warn` and return.
 *  - D-09 (retry_count): computed at write time by counting prior rows for the
 *    same `attempt_id + step + status`. Call sites should `void recordPipelineEvent(...)`
 *    on the hot path so the observability write never adds user-facing latency.
 */

import { requireServiceClient } from '@/lib/supabase/service'

export type PipelineStep =
  | 'save_recording'
  | 'transcribe'
  | 'analyze'
  | 'generate_estimate'
  | 'preview_redirect'
export type PipelineStatus = 'started' | 'succeeded' | 'failed'
export type PipelineInputType = 'recording' | 'photo' | 'manual_text'

export interface PipelineEventInput {
  attemptId: string
  inputType: PipelineInputType
  step: PipelineStep
  status: PipelineStatus
  companyId?: string | null
  projectId?: string | null
  estimateId?: string | null
  userId?: string | null
  provider?: 'openai' | 'openrouter' | 'anthropic' | null
  errorMessage?: string | null
  errorCode?: string | null
  durationMs?: number | null
  /**
   * Phase 168 (PHOTO-02/03): optional structured counts/context — additive,
   * existing consumers unaffected (column defaults to NULL). First use:
   * analyze-photos' terminal `succeeded` event carries
   * `{ analyzedCount, totalCount, failedCount }` so 168-02's "N of M photos
   * analyzed" UI can read it back off the journal (poll-outcome).
   */
  metadata?: Record<string, unknown> | null
}

/**
 * Best-effort (D-06): inserts a D-02-shaped row into `pipeline_events` via the
 * service-role client. NEVER throws, NEVER rejects the caller — on any failure
 * it logs a `console.warn` and returns. Safe to `void` on the hot path.
 */
export async function recordPipelineEvent(ev: PipelineEventInput): Promise<void> {
  try {
    const svc = requireServiceClient()
    const retryCount = await computeRetryCount(svc, ev)
    await svc.from('pipeline_events').insert({
      attempt_id: ev.attemptId,
      input_type: ev.inputType,
      step: ev.step,
      status: ev.status,
      company_id: ev.companyId ?? null,
      project_id: ev.projectId ?? null,
      estimate_id: ev.estimateId ?? null,
      user_id: ev.userId ?? null,
      provider: ev.provider ?? null,
      error_message: ev.errorMessage ?? null,
      error_code: ev.errorCode ?? null,
      duration_ms: ev.durationMs ?? null,
      retry_count: retryCount,
      metadata: ev.metadata ?? null,
    })
  } catch (err) {
    // D-06: swallow — a logging failure must never break the pipeline.
    console.warn('[recordPipelineEvent] swallowed write failure:', err)
  }
}

/**
 * Computes `retry_count` (D-09) by counting prior rows for the same
 * `attempt_id + step + status`. Returns 0 on the first execution, 1 on the
 * first retry, and so on. `started` rows always return 0.
 *
 * Tradeoff: under concurrent retries of the same step there is a TOCTOU window
 * (two writes could both read count=0 and store 0). This is acceptable —
 * `retry_count` is a diagnostic hint for observability, not an exact/idempotent
 * billing key (RESEARCH §retry_count Mechanics). Exact ordinals, if ever needed,
 * are computed at read time in Phase 93. If the count query itself fails it is
 * caught by the caller's try/catch and defaults to 0 (never breaks the write).
 */
async function computeRetryCount(
  svc: ReturnType<typeof requireServiceClient>,
  ev: PipelineEventInput
): Promise<number> {
  if (ev.status === 'started') return 0
  const { count } = await svc
    .from('pipeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('attempt_id', ev.attemptId)
    .eq('step', ev.step)
    .eq('status', ev.status)
  return count ?? 0
}
