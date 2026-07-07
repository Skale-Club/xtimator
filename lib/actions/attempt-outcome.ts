'use server'

/**
 * 260707-lyq (P4 Wave 1) — journal-first attempt outcome for the capture client.
 *
 * Production evidence (attempt 8a0c13e8, 2026-07-07 19:45 UTC): a vague-input
 * attempt produced a transient $0 estimate that auto-refine later DELETED; the
 * client's DB-truth poller (lib/estimate/poll-outcome.ts) had already read the
 * doomed estimate id and navigated to a ghost. The journal (pipeline_events) is
 * the ONLY source that can tell "succeeded, and durably so" apart from
 * "succeeded, then vanished" — this action is that read-side.
 *
 * Rules (validated against production data 2026-07-07 — see PLAN <interfaces>):
 *   - completed: a generate_estimate/succeeded event exists AND its estimate_id
 *     row still exists in estimates (is_current=true).
 *   - needs_details: generate_estimate/succeeded event exists AND its
 *     estimate_id is null OR the row no longer exists.
 *   - failed: any event with status='failed' AND error_code NOT IN
 *     ('client_reported') — includes watchdog_timeout.
 *   - pending: otherwise — lastStep/lastStatus carried for stage progression.
 * Precedence: completed/needs_details are evaluated BEFORE failed — a genuine
 * terminal success wins over a stale failed row (e.g. the 18:40 false
 * client-report on attempt 4a26ffb7, which later succeeded for real).
 *
 * Never throws (matches recordPipelineEvent's D-06 best-effort discipline): a
 * read failure degrades to 'pending' so the client's own fallback + timeout
 * keeps working instead of the UI breaking on an observability hiccup.
 */
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { FALLBACK_MEDIANS_MS } from '@/lib/estimate/progress-model'

export type AttemptOutcome =
  | { state: 'completed'; estimateId: string }
  // QUICK-psh-02: reason/questions are additive enrichment read from
  // projects.needs_details (set once at the final vague terminal — see
  // lib/estimate/adapters/default.ts). Optional/absent when the attempt_id
  // doesn't match (stale row from a prior attempt) or the column read fails —
  // the bare `needs_details` shape stays a valid, backward-compatible outcome.
  | { state: 'needs_details'; reason?: string; questions?: string[] }
  | { state: 'failed'; step: string; reason: string }
  // 260707-o7a: pending carries the journal-derived progress payload so the
  // client can drive the REAL progress bar (lib/estimate/progress-model.ts):
  //   completedSteps — steps with a `succeeded` event, in journal order;
  //   activeStepStartedAt — created_at of the latest `started` event whose
  //   step has no `succeeded` event yet (null when nothing is mid-flight).
  | {
      state: 'pending'
      lastStep: string | null
      lastStatus: string | null
      completedSteps: string[]
      activeStepStartedAt: string | null
    }
  | { state: 'unauthorized' }

interface JournalRow {
  step: string
  status: string
  error_code: string | null
  error_message: string | null
  estimate_id: string | null
  company_id: string | null
  // QUICK-psh-02: needed to read the project's needs_details enrichment.
  project_id: string | null
  created_at: string
}

/**
 * QUICK-psh-02: reads projects.needs_details (set once at the final vague
 * terminal — lib/estimate/adapters/default.ts) and enriches the bare
 * needs_details outcome when it belongs to THIS attempt. Tolerates absent
 * column data, a missing projectId, or any read failure — always degrades to
 * the bare `{ state: 'needs_details' }` shape rather than throwing.
 */
async function enrichNeedsDetails(
  svc: ReturnType<typeof requireServiceClient>,
  projectId: string | null,
  attemptId: string
): Promise<AttemptOutcome> {
  if (!projectId) return { state: 'needs_details' }
  try {
    const { data } = await svc
      .from('projects')
      .select('needs_details')
      .eq('id', projectId)
      .maybeSingle()
    const nd = (
      data as { needs_details?: { reason?: string; questions?: string[]; attempt_id?: string } | null } | null
    )?.needs_details
    // Only surface the enrichment when it was written FOR this exact attempt —
    // a stale needs_details from a prior discarded attempt on the same project
    // must never bleed into a newer one's outcome.
    if (nd && nd.attempt_id === attemptId) {
      return { state: 'needs_details', reason: nd.reason, questions: nd.questions }
    }
    return { state: 'needs_details' }
  } catch (err) {
    console.warn('[getAttemptOutcome] needs-details enrichment swallowed failure:', err)
    return { state: 'needs_details' }
  }
}

export async function getAttemptOutcome(attemptId: string): Promise<AttemptOutcome> {
  try {
    // Minimal auth duplication (mirrors lib/actions/recording.ts getAuthContext) —
    // this is a read-only action, so it skips assertWritable() (no demo-mode
    // write gate applies to reading the journal).
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) return { state: 'unauthorized' }

    const activeCompanyId = await getActiveCompanyId()
    if (!activeCompanyId) return { state: 'unauthorized' }

    const svc = requireServiceClient()
    const { data } = await svc
      .from('pipeline_events')
      .select('step,status,error_code,error_message,estimate_id,company_id,project_id,created_at')
      .eq('attempt_id', attemptId)
      .order('created_at', { ascending: true })

    const rows = (data ?? []) as JournalRow[]
    if (rows.length === 0) {
      return { state: 'pending', lastStep: null, lastStatus: null, completedSteps: [], activeStepStartedAt: null }
    }

    // Company scope: at least one row must match the caller's active company
    // (rows with a null company_id — e.g. a pre-auth early return — are
    // tolerated and never block a match on their own). No match → this
    // attempt belongs to a different tenant; never leak its outcome.
    const matchesCompany = rows.some((r) => r.company_id === activeCompanyId)
    if (!matchesCompany) return { state: 'unauthorized' }

    // Precedence: completed/needs_details (terminal success shapes) BEFORE
    // failed — see module doc.
    const succeeded = rows.find(
      (r) => r.step === 'generate_estimate' && r.status === 'succeeded'
    )
    if (succeeded) {
      if (succeeded.estimate_id) {
        const { data: estimateRow } = await svc
          .from('estimates')
          .select('id')
          .eq('id', succeeded.estimate_id)
          .eq('is_current', true)
          .maybeSingle()
        if (estimateRow) {
          return { state: 'completed', estimateId: succeeded.estimate_id }
        }
      }
      // estimate_id was null, OR the row is gone (deleted by auto-refine, the
      // 8a0c13e8 race) — the attempt did not durably produce a usable estimate.
      // QUICK-psh-02: enrich with the classification + questions persisted at
      // the vague terminal, when available for THIS attempt.
      return await enrichNeedsDetails(svc, succeeded.project_id, attemptId)
    }

    const failed = rows.find(
      (r) => r.status === 'failed' && r.error_code !== 'client_reported'
    )
    if (failed) {
      return {
        state: 'failed',
        step: failed.step,
        reason: failed.error_message ?? 'Unknown error',
      }
    }

    const last = rows[rows.length - 1]

    // 260707-o7a: progress payload for the real progress bar.
    // completedSteps: first `succeeded` occurrence per step, journal order.
    const completedSteps: string[] = []
    const succeededSteps = new Set<string>()
    for (const r of rows) {
      if (r.status === 'succeeded' && !succeededSteps.has(r.step)) {
        succeededSteps.add(r.step)
        completedSteps.push(r.step)
      }
    }
    // activeStepStartedAt: created_at of the LATEST `started` row whose step
    // has no `succeeded` row in this attempt (ascending scan — last hit wins).
    let activeStepStartedAt: string | null = null
    for (const r of rows) {
      if (r.status === 'started' && !succeededSteps.has(r.step)) {
        activeStepStartedAt = r.created_at
      }
    }

    return {
      state: 'pending',
      lastStep: last.step,
      lastStatus: last.status,
      completedSteps,
      activeStepStartedAt,
    }
  } catch (err) {
    // Never throw — a read failure must not break the client's polling loop.
    console.warn('[getAttemptOutcome] swallowed read failure:', err)
    return { state: 'pending', lastStep: null, lastStatus: null, completedSteps: [], activeStepStartedAt: null }
  }
}

/**
 * 260707-o7a — live step-duration medians for the real progress bar.
 *
 * Company-AGNOSTIC aggregate (durations only — no tenant data leaks) over the
 * last 30 days of `succeeded` pipeline_events with a recorded duration_ms,
 * merged over {@link FALLBACK_MEDIANS_MS}. Auth-gated like getAttemptOutcome
 * (claims + active company required); on ANY failure (unauthenticated, query
 * error, empty data) it degrades to the static fallbacks — the progress bar
 * must never break on an observability read hiccup.
 *
 * percentile_disc(0.5) semantics are computed in JS over a bounded recent
 * window (most-recent 2000 rows): PostgREST cannot express a grouped
 * percentile aggregate without a dedicated DB function, and this plan ships
 * no migration. Identical result for the window read.
 *
 * Call ONCE per capture session (the client caches it), NOT per poll tick.
 */
export async function getStepMedians(): Promise<Record<string, number>> {
  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) return { ...FALLBACK_MEDIANS_MS }

    const activeCompanyId = await getActiveCompanyId()
    if (!activeCompanyId) return { ...FALLBACK_MEDIANS_MS }

    const svc = requireServiceClient()
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await svc
      .from('pipeline_events')
      .select('step,duration_ms')
      .eq('status', 'succeeded')
      .not('duration_ms', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000)
    if (error) return { ...FALLBACK_MEDIANS_MS }

    const byStep = new Map<string, number[]>()
    for (const row of (data ?? []) as { step: string; duration_ms: number | null }[]) {
      if (typeof row.duration_ms !== 'number' || row.duration_ms <= 0) continue
      const list = byStep.get(row.step)
      if (list) list.push(row.duration_ms)
      else byStep.set(row.step, [row.duration_ms])
    }

    const medians: Record<string, number> = { ...FALLBACK_MEDIANS_MS }
    for (const [step, durations] of byStep) {
      durations.sort((a, b) => a - b)
      // percentile_disc(0.5): smallest value with cumulative distribution >= 0.5.
      medians[step] = durations[Math.ceil(durations.length * 0.5) - 1]
    }
    return medians
  } catch (err) {
    console.warn('[getStepMedians] swallowed read failure:', err)
    return { ...FALLBACK_MEDIANS_MS }
  }
}
