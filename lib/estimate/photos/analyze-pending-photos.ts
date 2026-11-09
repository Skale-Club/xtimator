/**
 * Safety net for estimate generation: analyze the project's photos that still
 * have no `ai_description` BEFORE the estimate is generated.
 *
 * Why: generate-estimate only uses photos with a non-empty `ai_description`.
 * The photos-only capture path analyzes them through the analyze-photos job, but
 * audio + photos, text + photos and WhatsApp never dispatch that job, so the
 * photos were uploaded and then silently ignored. Calling this from the
 * generate-estimate job covers every path at once.
 *
 * Contract (best-effort, never throws):
 *   - nothing pending -> returns immediately, no vision call
 *   - a photo whose analysis fails is skipped; generation continues without it
 *   - already-described photos are never re-analyzed (idempotent on retry)
 *   - per-photo work is the SAME helper the analyze-photos job uses
 *     (analyzePhotoById); cost rows keep operation_type 'vision' under the
 *     per-photo cost attempt id, so the 'estimate' debit (which sums only
 *     'estimate' / 'estimate_retry') never includes them.
 *   - the vision spend is debited once here as 'photo_batch', like the job does.
 */
import { requireServiceClient } from '@/lib/supabase/service'
import { recordUsage } from '@/lib/quota'
import { recordCreditDebit } from '@/lib/billing/credit-ledger'
import {
  analyzePhotoById,
  visionCostAttemptId,
  VISION_CHUNK_SIZE,
} from '@/lib/inngest/functions/analyze-photos'

export interface AnalyzePendingPhotosResult {
  /** Photos that had no description when the step started. */
  pending: number
  analyzed: number
  failed: number
}

export async function analyzePendingPhotos(args: {
  companyId: string
  projectId: string
  attemptId: string
  requestId: string
}): Promise<AnalyzePendingPhotosResult> {
  const { companyId, projectId, attemptId, requestId } = args
  const result: AnalyzePendingPhotosResult = { pending: 0, analyzed: 0, failed: 0 }
  try {
    const svc = requireServiceClient()
    // Scoped by company_id as well as project_id (service role bypasses RLS).
    const { data } = await svc
      .from('photos')
      .select('id, storage_path')
      .eq('project_id', projectId)
      .eq('company_id', companyId)
      .order('sort_order')
      .is('ai_description', null)
    const photos = (data ?? []) as Array<{ id: string; storage_path: string }>
    result.pending = photos.length
    if (photos.length === 0) return result

    const succeededIds: string[] = []
    for (let i = 0; i < photos.length; i += VISION_CHUNK_SIZE) {
      const chunk = photos.slice(i, i + VISION_CHUNK_SIZE)
      const settled = await Promise.allSettled(
        chunk.map((photo) =>
          analyzePhotoById({ photo, companyId, projectId, attemptId, requestId })
        )
      )
      settled.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          succeededIds.push(r.value.photoId)
        } else {
          result.failed += 1
          console.warn(
            `[analyze-pending-photos] vision failed for photo ${chunk[idx].id}:`,
            r.reason instanceof Error ? r.reason.message : String(r.reason)
          )
        }
      })
    }
    result.analyzed = succeededIds.length
    if (succeededIds.length === 0) return result

    // Usage + debit for the photos analyzed HERE. The keys carry a suffix so
    // they cannot collide with the estimate's own usage/debit keys (usage_events
    // dedupes on (company_id, idempotency_key) alone, and the estimate uses the
    // bare requestId).
    try {
      await recordUsage(svc, companyId, 'photo_analyzed', succeededIds.length, `${requestId}:gen-photos`)
    } catch (err) {
      console.warn('[analyze-pending-photos] record usage failed:', err instanceof Error ? err.message : String(err))
    }
    try {
      const costAttemptIds = succeededIds.map((id) => visionCostAttemptId(attemptId, requestId, id))
      let realCostUsd: number | null = null
      for (let i = 0; i < 3; i++) {
        const { data: costRows } = await svc
          .from('ai_cost_events')
          .select('real_cost_usd')
          .in('attempt_id', costAttemptIds)
          .eq('operation_type', 'vision')
        const rows = (costRows ?? []) as { real_cost_usd: number | null }[]
        if (rows.length > 0) {
          const known = rows.map((r) => r.real_cost_usd).filter((c): c is number => c != null)
          realCostUsd = known.length > 0 ? known.reduce((a, b) => a + b, 0) : null
          break
        }
        await new Promise((res) => setTimeout(res, 150))
      }
      await recordCreditDebit({
        companyId,
        operationType: 'photo_batch',
        realCostUsd,
        attemptId,
        runKey: `${requestId}:gen-photos`,
      })
    } catch (err) {
      console.warn('[analyze-pending-photos] credit debit failed:', err instanceof Error ? err.message : String(err))
    }
  } catch (err) {
    console.warn('[analyze-pending-photos] skipped:', err instanceof Error ? err.message : String(err))
  }
  return result
}
