/**
 * lib/observability/generation-phase.ts
 *
 * `reportGeneratePhase()`: the ONE way the generation pipeline tells the
 * journal which sub-phase of `generate_estimate` it just entered.
 *
 * Shape choice (deliberate, migration-free): a phase row is a normal
 * `generate_estimate` / `started` event carrying `metadata.phase`. It does NOT
 * introduce new `step` values, because `pipeline_events.step` has a CHECK
 * constraint (20260529000001_phase92_pipeline_events.sql) and both the
 * `pipeline_attempts` view and `classifyLastEvent` (pipeline-watchdog.ts) key
 * their terminal semantics off the step vocabulary. Extra `started` rows are
 * inert for all three: the view's terminal_status reads the LATEST row (always
 * `preview_redirect`/`succeeded` on a healthy attempt), `computeRetryCount`
 * short-circuits on `started` (no extra query), and the watchdog treats a fresh
 * `started` row as "still alive", which, during a genuinely long generation,
 * it is. A stuck run stops emitting phases, so the watchdog still fires.
 *
 * Best-effort like every other journal write (D-06): never throws, never
 * awaited on the hot path: a phase write must never slow down or break a
 * generation. Call sites `void` it.
 */
import { recordPipelineEvent, type PipelineInputType } from './pipeline-events'
import type { GeneratePhase, GeneratePhaseDetail } from '@/lib/estimate/generation-phases'

export interface ReportGeneratePhaseInput {
  /**
   * The attempt lineage id. When absent (a caller with no attempt context,
   * e.g. a direct service invocation outside the Inngest job) the report is a
   * NO-OP: a phase row with no attempt cannot be joined to anything, and
   * inventing an id would fabricate an orphan attempt in the journal.
   */
  attemptId: string | null | undefined
  phase: GeneratePhase
  companyId?: string | null
  projectId?: string | null
  inputType?: PipelineInputType
  detail?: GeneratePhaseDetail
}

export function reportGeneratePhase(input: ReportGeneratePhaseInput): void {
  if (!input.attemptId) return
  void recordPipelineEvent({
    attemptId: input.attemptId,
    // The phase row belongs to the attempt's real input type when the caller
    // knows it; 'manual_text' matches the Inngest job's own default fallback.
    inputType: input.inputType ?? 'manual_text',
    step: 'generate_estimate',
    status: 'started',
    companyId: input.companyId ?? null,
    projectId: input.projectId ?? null,
    metadata: {
      phase: input.phase,
      ...(input.detail ?? {}),
    },
  })
}
