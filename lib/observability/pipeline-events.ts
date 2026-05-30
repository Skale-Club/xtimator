/**
 * Phase 92 — Pipeline event helper (Wave 0 SCAFFOLD).
 *
 * This is an intentionally non-functional stub created in Wave 0 so the RED
 * Nyquist tests (tests/unit/observability/record-pipeline-event.test.ts) and any
 * future instrumentation call sites can compile (`tsc --noEmit` clean) before the
 * real implementation lands. Wave 1 replaces the body of `recordPipelineEvent`
 * with the best-effort service-role insert + retry_count computation (D-04/D-06/D-09).
 *
 * The exported types below are the locked contract (CONTEXT.md <interfaces>); only
 * the function body is a stub. Do NOT rely on this stub recording anything — it throws.
 */

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
}

/**
 * Wave 0 stub — NOT the real implementation. Throws so behavioral tests fail RED
 * until Wave 1 supplies the best-effort insert. (Best-effort = never throws is a
 * Wave-1 contract; this stub deliberately does not satisfy it yet.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function recordPipelineEvent(_ev: PipelineEventInput): Promise<void> {
  throw new Error('recordPipelineEvent: not implemented (Wave 0 scaffold)')
}
