/**
 * Phase 67: Inngest function — wraps Phase 41 generateEstimateForProject service
 * with step.run checkpoints. Retries skip already-successful steps so Anthropic
 * is never charged twice for the same job.
 *
 * Implements:
 *   - INNGEST-02 (route returns jobId; recordUsage on success only)
 *   - INNGEST-06 (idempotent via event.data.requestId)
 */
import { inngest } from '@/lib/inngest/client'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { recordUsage } from '@/lib/quota'
import {
  EVENT_ESTIMATE_GENERATE,
  type EstimateGeneratePayload,
} from '@/lib/inngest/events'

export const generateEstimateJob = inngest.createFunction(
  {
    id: 'generate-estimate',
    idempotency: 'event.data.requestId',
    retries: 2,
    triggers: [{ event: EVENT_ESTIMATE_GENERATE }],
  },
  async ({ event, step }) => {
    const { companyId, projectId, requestId, language } =
      event.data as EstimateGeneratePayload

    // Step 1: Heavy AI call — checkpointed. A retry of step 2 will NOT re-call.
    const result = await step.run('call-ai-provider', async () => {
      return await generateEstimateForProject(companyId, projectId, {
        language: language ?? undefined,
      })
    })

    // Step 2: Record usage ONLY on AI success — separate step so a DB write
    // failure can retry independently. usage_events partial UNIQUE index on
    // (company_id, idempotency_key) makes this idempotent at the DB layer.
    await step.run('record-usage', async () => {
      const supabase = requireServiceClient()
      await recordUsage(supabase, companyId, 'estimate_generated', 1, requestId)
    })

    return result
  }
)
