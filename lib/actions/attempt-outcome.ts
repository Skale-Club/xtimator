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

export type AttemptOutcome =
  | { state: 'completed'; estimateId: string }
  | { state: 'needs_details' }
  | { state: 'failed'; step: string; reason: string }
  | { state: 'pending'; lastStep: string | null; lastStatus: string | null }
  | { state: 'unauthorized' }

interface JournalRow {
  step: string
  status: string
  error_code: string | null
  error_message: string | null
  estimate_id: string | null
  company_id: string | null
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
      .select('step,status,error_code,error_message,estimate_id,company_id')
      .eq('attempt_id', attemptId)
      .order('created_at', { ascending: true })

    const rows = (data ?? []) as JournalRow[]
    if (rows.length === 0) {
      return { state: 'pending', lastStep: null, lastStatus: null }
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
      return { state: 'needs_details' }
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
    return { state: 'pending', lastStep: last.step, lastStatus: last.status }
  } catch (err) {
    // Never throw — a read failure must not break the client's polling loop.
    console.warn('[getAttemptOutcome] swallowed read failure:', err)
    return { state: 'pending', lastStep: null, lastStatus: null }
  }
}
