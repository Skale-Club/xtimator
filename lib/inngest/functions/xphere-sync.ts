/**
 * Phase 1000 (XPHERE-B4): Inngest function — Xphere CRM sync job.
 *
 * The durable, non-blocking execution core for the Xtimator→Xphere mirror.
 * Thin by design: load company fresh → buildSyncPayload (Plan 01, pure) →
 * syncCompany (Plan 03 client) → persist the mirrored entity IDs.
 *
 * Reliability (see 1000-CONTEXT.md <decisions>):
 *   - syncCompany throws on non-2xx/network error → Inngest retries (retries:3).
 *   - Idempotency is guaranteed Xphere-side by upsert-by-external_id (company.id),
 *     so retries and backfill re-runs are safe.
 *   - Unconfigured deployments: syncCompany returns null → short-circuit success
 *     (disabled-by-default; no sync-state writes).
 *   - On retry exhaustion, onFailure persists companies.xphere_sync_error.
 */
import { inngest } from '@/lib/inngest/client'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { requireServiceClient } from '@/lib/supabase/service'
import { buildSyncPayload } from '@/lib/integrations/xphere/mapping'
import { syncCompany } from '@/lib/integrations/xphere/client'
import type { XphereCompanyInput } from '@/lib/integrations/xphere/types'
import {
  EVENT_XPHERE_SYNC,
  type XphereSyncRequestedPayload,
} from '@/lib/inngest/events'

/** Columns the pure mapping reads (companies.id is the Xphere external_id). */
const COMPANY_COLUMNS =
  'id, name, owner_name, email, phone, industry, website, address, tier, tier_trial_ends_at, stripe_customer_id, created_at'

export const xphereSyncJob = inngest.createFunction(
  {
    id: 'xphere-sync',
    retries: 3,
    triggers: [{ event: EVENT_XPHERE_SYNC }],
    // On retry exhaustion, surface the failure on the company row (best-effort).
    onFailure: async ({ event, error }) => {
      try {
        const payload = (
          event as { data?: { event?: { data?: XphereSyncRequestedPayload } } }
        ).data?.event?.data
        if (!payload?.companyId) return
        const denied = await assertCompanyWritable(payload.companyId)
        if (denied) return
        const svc = requireServiceClient()
        await svc
          .from('companies')
          .update({ xphere_sync_error: String(error).slice(0, 500) })
          .eq('id', payload.companyId)
      } catch {
        /* best-effort — never throw from onFailure */
      }
    },
  },
  async ({ event, step }) => {
    const data = event.data as XphereSyncRequestedPayload
    const { companyId } = data
    const denied = await assertCompanyWritable(companyId)
    if (denied) return { skipped: true, reason: 'demo_readonly' as const }

    // Step 1: load company fresh (service role; RLS-bypass; no auth context in worker).
    const company = await step.run('load-company', async () => {
      const svc = requireServiceClient()
      const { data: row, error } = await svc
        .from('companies')
        .select(COMPANY_COLUMNS)
        .eq('id', companyId)
        .single()
      if (error || !row) throw new Error(`[xphere] company ${companyId} not found`)
      return row
    })

    // Step 2: sync (build payload + POST). Separate step so a DB write error
    // (step 3) does not re-POST. If unconfigured, syncCompany returns null →
    // short-circuit success (disabled-by-default).
    const result = await step.run('sync-company', async () => {
      const payload = buildSyncPayload(
        company as unknown as XphereCompanyInput,
        data.event,
      )
      if (data.occurredAt) payload.occurred_at = data.occurredAt
      return await syncCompany(payload) // throws on non-2xx → Inngest retries
    })

    // Step 3: persist outcome.
    await step.run('persist-result', async () => {
      const svc = requireServiceClient()
      if (!result) {
        // Unconfigured no-op — do not touch sync state.
        return { skipped: true }
      }
      const { error } = await svc
        .from('companies')
        .update({
          xphere_account_id: result.account_id,
          xphere_contact_id: result.contact_id,
          xphere_opportunity_id: result.opportunity_id ?? null,
          xphere_synced_at: new Date().toISOString(),
          xphere_sync_error: null,
        })
        .eq('id', companyId)
      if (error) {
        throw new Error(`[xphere] failed to persist sync state: ${error.message}`)
      }
      return { ok: true }
    })

    return { companyId, event: data.event }
  },
)
