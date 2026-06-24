/**
 * Phase 110 — Real Cost Capture Foundation (COST-03) / Measure-Only Mode (CALIB-01).
 *
 * A single best-effort `recordAICost()` that every AI call site invokes as a
 * fire-and-forget side effect. It maps the camelCase {@link AICostInput} to the
 * snake_case `ai_cost_events` row and writes via `requireServiceClient()`
 * (RLS-bypassing, service-role only — never the browser client) — wrapped in
 * try/catch so it NEVER throws or rejects the caller.
 *
 * This mirrors `recordPipelineEvent` (lib/observability/pipeline-events.ts) EXACTLY:
 *  - Best-effort: a cost-write failure must never break generation/transcription.
 *    On any error we `console.warn` and return void. Call sites `void recordAICost(...)`
 *    on the hot path so the cost write never adds user-facing latency or risk.
 *
 * MEASURE-ONLY (CALIB-01): this module only records the real cost of an AI call.
 * It imports nothing from a charging module and performs no charging arithmetic.
 * It writes one row and returns void — there is deliberately no return value a
 * caller could consume to charge a tenant. A separate consumption table (Phase 112)
 * reads these rows later; charging does not begin until calibration (Phase 116).
 * The measure-only invariant is locked by tests/unit/billing/measure-only-invariant.ts.
 *
 * null vs 0 discipline: `realCostUsd` is `number | null` and is passed THROUGH to
 * the DB unchanged. NULL means the provider returned no cost (e.g. Gemini, or an
 * unknown Whisper rate) — it is NEVER coerced to 0, so calibration can exclude
 * unknowns from the mean instead of biasing it toward zero.
 */

import { requireServiceClient } from '@/lib/supabase/service'

export interface AICostInput {
  attemptId: string
  operationType:
    | 'estimate'
    | 'photo_batch'
    | 'audio_minutes'
    | 'price_research'
    | 'translation'
    | 'vision'
  provider: 'openrouter' | 'openai' | 'anthropic' | 'gemini'
  realCostUsd: number | null // null = provider gave no cost (NEVER 0)
  companyId?: string | null
  projectId?: string | null
  estimateId?: string | null
  model?: string | null
  units?: number | null // photo count / audio minutes (optional context)
}

/**
 * Best-effort: inserts one `ai_cost_events` row via the service-role client.
 * NEVER throws, NEVER rejects the caller — on any failure it logs a `console.warn`
 * and returns. Safe to `void` on the hot path.
 */
export async function recordAICost(ev: AICostInput): Promise<void> {
  try {
    const svc = requireServiceClient()
    await svc.from('ai_cost_events').insert({
      attempt_id: ev.attemptId,
      operation_type: ev.operationType,
      provider: ev.provider,
      real_cost_usd: ev.realCostUsd, // pass null THROUGH — never `?? 0`
      company_id: ev.companyId ?? null,
      project_id: ev.projectId ?? null,
      estimate_id: ev.estimateId ?? null,
      model: ev.model ?? null,
      units: ev.units ?? null,
    })
  } catch (err) {
    // Best-effort: swallow — a cost-write failure must never break the pipeline.
    console.warn('[recordAICost] swallowed write failure:', err)
  }
}
