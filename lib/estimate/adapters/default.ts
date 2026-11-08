/**
 * lib/estimate/adapters/default.ts
 *
 * Web/MCP ChannelAdapter for the shared estimate graph. A type-correct,
 * WhatsApp-free adapter: no channel side-effects beyond the vague-estimate
 * recourse state (awaiting_details / needs_details).
 *
 * Design (D-02): web/MCP transcripts + photo descriptions are already persisted
 * upstream (the decoupled ingestion path), so the graph enters effectively at
 * `generate`. Hence:
 *   - ingest:   passthrough guard — returns {} (inputs are already ingested upstream).
 *   - finalize: no-op on success (the HTTP/poll layer surfaces the estimate); on a
 *               final-vague outcome it reverts the $0 estimate and asks for details.
 *   - onError:  re-throws so Inngest retry + onFailure fires (D-02).
 *
 * This module imports NOTHING from lib/whatsapp/* — the WhatsApp adapter is the
 * only place WhatsApp code lives (ENGINE-01 neutrality).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstimateStateType } from '@/lib/estimate/graph/state'
import type { ChannelAdapter } from '@/lib/estimate/graph/types'
import { revertVagueEstimate } from '@/lib/estimate/quality/revert'
import { failureReasonToXtimatorError } from '@/lib/estimate/failure'
import { buildNeedsDetails } from '@/lib/ai/needs-details'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

/**
 * Default (web/MCP) ChannelAdapter closure-factory. Mirrors the WhatsApp adapter
 * shape (companyId/supabase captured in the closure, never graph-input fields).
 * ownerPhone is intentionally absent — web/MCP have no per-message reply target.
 */
export function makeDefaultAdapter({ companyId, supabase }: {
  companyId: string
  supabase: SupabaseClient
}): ChannelAdapter {
  return {
    channel: 'web',

    // Passthrough — web/MCP inputs are already ingested upstream.
    async ingest(_state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      return {}
    },

    // Handles the vague-after-refine path (Phase 96, D-06).
    async finalize(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      // Act on ANY final-vague outcome. The graph only reaches finalize while still vague
      // once the auto-refine cap is exhausted (checkVagueAfterAssessEdge), and that cap may
      // be 0 (AUTO_REFINE_MAX_ATTEMPTS=0 -> refineAttempts stays 0): a $0 estimate must
      // never be delivered as completed. Success path (isVague=false) is a no-op —
      // the HTTP/poll layer surfaces the estimate via job output.
      if (state.isVague) {
        // Best-effort revert of the $0 estimate + reset project to draft.
        try {
          await revertVagueEstimate(supabase, state.projectId, state.estimateId ?? null)
        } catch {
          // non-fatal
        }
        // Persist the awaiting_details signal for the web UI (SMART-03).
        // projects.status is unconstrained TEXT — no migration needed (Pitfall 2).
        await supabase
          .from('projects')
          .update({ status: 'awaiting_details' })
          .eq('id', state.projectId)
          .eq('company_id', companyId)  // companyId from closure (QA-02), NOT state

        // QUICK-psh-01: classify WHY + generate clarifying questions at THIS
        // single final-vague terminal (autoRefine's intermediate revert never
        // reaches finalize — see checkVagueAfterAssessEdge — so this call fires
        // exactly once per discarded attempt). Never-throw: any failure here
        // must not undo the awaiting_details signal already persisted above.
        try {
          // Promise.allSettled (not Promise.all): a single query failing (e.g.
          // recordings) must not also discard photos/company data that DID
          // resolve — each input degrades independently to its safe default.
          const [recordingsResult, photosResult, companyResult] = await Promise.allSettled([
            getProjectRecordings(supabase, state.projectId),
            getProjectPhotos(supabase, state.projectId),
            supabase.from('companies').select('industry').eq('id', companyId).maybeSingle(),
          ])
          const recordings = recordingsResult.status === 'fulfilled' ? recordingsResult.value : []
          const photos = photosResult.status === 'fulfilled' ? photosResult.value : []
          const companyRow =
            companyResult.status === 'fulfilled'
              ? (companyResult.value as { data?: { industry?: string | null } | null })
              : null

          const inputSummary = [
            ...recordings.map((r) => r.transcript).filter((t): t is string => !!t?.trim()),
            ...photos.map((p) => p.ai_description).filter((d): d is string => !!d?.trim()),
            ...(state.prompts ?? []),
          ]
            .join('\n\n')
            .trim()
          const language = (state.estimateLanguage as EstimateLanguage | undefined) ?? 'en'
          const industryHint = companyRow?.data?.industry ?? undefined

          // SEED-057 D: the questions the estimator itself raised come first. They
          // are specific to THIS job, were produced with the whole source in view,
          // and cost no extra model call. The classification call only runs when
          // the estimator raised none (it also detects mic tests).
          const raised = (state.openQuestions ?? []).filter((q) => q.trim().length > 0).slice(0, 4)
          const needsDetails =
            raised.length > 0
              ? { reason: 'missing_specifics' as const, questions: raised }
              : await buildNeedsDetails(inputSummary, language, industryHint, {
                  attemptId: state.attemptId ?? null,
                  companyId,
                  projectId: state.projectId,
                })

          await supabase
            .from('projects')
            .update({
              needs_details: {
                reason: needsDetails.reason,
                questions: needsDetails.questions,
                attempt_id: state.attemptId ?? null,
                created_at: new Date().toISOString(),
              },
            })
            .eq('id', state.projectId)
            .eq('company_id', companyId)
        } catch (err) {
          // non-fatal — the awaiting_details signal above already landed; the
          // popup/banner fall back to the plain vague message with no enrichment.
          console.warn('[default-adapter] needs-details enrichment swallowed failure:', err)
        }

        // Return needsDetails=true so it surfaces in the Inngest job output (SMART-04).
        // /api/jobs/[jobId] returns run.output as-is → MCP callers read output.needsDetails.
        // The estimate row was deleted by revertVagueEstimate above, so the state
        // must not keep pointing at it: `undefined` clears the last-value channel
        // (verified), and the job derives its succeeded row / push kind from this.
        return { needsDetails: true, estimateId: undefined }
      }
      return {}
    },

    // Re-throws so Inngest retry + onFailure fires (D-02). The thrown value is now a
    // typed XtimatorError (HARD-04) — its .message still reads cleanly (detail ?? reason)
    // so Inngest onFailure (which reads error.message) keeps working.
    async onError(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      throw failureReasonToXtimatorError(
        state.failure?.reason ?? 'generation_failed',
        state.failure?.detail
      )
    },
  }
}
