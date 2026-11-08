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
    // MEASURE-ONLY (CR13): absorbed chat spend — recorded so calibration can
    // see it. Deliberately absent from the chargeable-operation list, so it
    // can never be billed to a tenant.
    | 'chat'
    // A repeat 'estimate' cost for the SAME attempt (schema-repair retry,
    // auto-refine second pass, Inngest retry). Written by recordAICost itself on a
    // 23505 collision; the 'estimate' read-back in the generate job sums both.
    | 'estimate_retry'
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
/** Postgres unique_violation — the Phase 167 partial unique index already has this row. */
const PG_UNIQUE_VIOLATION = '23505'
/** Postgres check_violation — 'estimate_retry' is not allowed yet (migration not applied). */
const PG_CHECK_VIOLATION = '23514'

export async function recordAICost(ev: AICostInput): Promise<void> {
  try {
    const svc = requireServiceClient()
    const row = {
      attempt_id: ev.attemptId,
      operation_type: ev.operationType as string,
      provider: ev.provider,
      real_cost_usd: ev.realCostUsd, // pass null THROUGH — never `?? 0`
      company_id: ev.companyId ?? null,
      project_id: ev.projectId ?? null,
      estimate_id: ev.estimateId ?? null,
      model: ev.model ?? null,
      units: ev.units ?? null,
    }
    const { error } = await svc.from('ai_cost_events').insert(row)
    if (!error) return
    const code = (error as { code?: string }).code
    if (code === PG_UNIQUE_VIOLATION) {
      // Phase 167 (BILL-04): the PARTIAL unique index on (attempt_id,
      // operation_type) — 'audio_minutes'/'estimate' only — rejects a second
      // row for the same attempt+op. For 'audio_minutes' that is the dedup guard
      // doing its job (swallow). For 'estimate' the second row is REAL spend (a
      // schema-repair retry, auto-refine pass or Inngest retry), so keep it as
      // 'estimate_retry', which the index does not cover.
      if (ev.operationType !== 'estimate') return
      const { error: retryError } = await svc
        .from('ai_cost_events')
        .insert({ ...row, operation_type: 'estimate_retry' })
      if (retryError) {
        if ((retryError as { code?: string }).code === PG_CHECK_VIOLATION) {
          // Migration 20261108000003 not applied yet: degrade to the old behavior.
          console.warn(
            "[recordAICost] 'estimate_retry' not allowed by operation_type CHECK (migration not applied); retry cost dropped"
          )
        } else {
          console.warn('[recordAICost] retry insert failed:', retryError)
        }
      }
      return
    }
    // Any OTHER error warns (previously the return value was discarded entirely).
    console.warn('[recordAICost] insert failed:', error)
  } catch (err) {
    // Best-effort: swallow — a cost-write failure must never break the pipeline.
    console.warn('[recordAICost] swallowed write failure:', err)
  }
}
