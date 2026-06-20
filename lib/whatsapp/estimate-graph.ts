/**
 * lib/whatsapp/estimate-graph.ts
 *
 * THIN WhatsApp wiring layer (Phase 94, D-04 / CHAN-01).
 *
 * The canonical estimate graph + its nodes now live in the channel-neutral
 * `lib/estimate/graph/` module; all WhatsApp side-effects (the Send media
 * fan-out, sessions, sendWhatsAppMessage, the two-copy error reply) live in
 * `lib/estimate/adapters/whatsapp.ts`. This file is what remains: a stable
 * `buildEstimateGraph()` export that composes the shared core with the WhatsApp
 * ChannelAdapter, preserving the EXACT external contract `whatsapp-process.ts`
 * (and the QA-01 frozen regression test) call today.
 *
 * The WhatsApp inbound flow runs entirely on the shared graph with behavior
 * preserved:
 *   START → ingest (Send fan-out + media) → generate → assess
 *         → finalize (askDetails | sendConfirmation) | onError → END
 *
 * Contract preserved (D-13): `buildEstimateGraph()` is zero-arg and returns an
 * object with `.invoke(initialState)`. The initial state is the WhatsApp-superset
 * shape (companyId/projectId/ownerPhone/messages/... ) callers already pass. The
 * tenant scope (companyId/ownerPhone) and the inbound messages are lifted OUT of
 * that input and captured in the WhatsApp adapter's closure per invocation — the
 * channel-neutral core state never carries WhatsApp fields (D-07).
 *
 * NOTE (source-text anchor test, Pitfall 1): this rewire MOVES the WhatsApp node
 * bodies + the `generationFailed`→`failure` rename OUT of this file into the
 * adapter/core. `tests/unit/inngest/whatsapp-process-job.test.ts` greps THIS file
 * for those tokens, so it goes RED until Plan 94-04 updates its `readFileSync`
 * PATHS to the new homes (a path update, allowed under D-13). That is expected
 * and intentional — the behavioral safety net is QA-01 (never-reply-regression),
 * which stays green.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'
import { requireServiceClient } from '@/lib/supabase/service'
import { buildEstimateGraph as buildSharedEstimateGraph } from '@/lib/estimate/graph'
import { makeWhatsAppAdapter } from '@/lib/estimate/adapters/whatsapp'
import { CallbackHandler } from '@langfuse/langchain'

/** WhatsApp-superset initial state the existing callers/tests pass to invoke. */
interface WhatsAppInitialState {
  companyId: string
  projectId: string
  ownerPhone: string
  /** Discriminator passed by whatsapp-process.ts; the wiring hardcodes 'whatsapp'. */
  channel?: 'whatsapp'
  messages: WhatsAppMessage[]
  currentMessage?: WhatsAppMessage
  mediaResults?: Array<{ msgId: string; ok: boolean; reason?: string }>
  estimateId?: string
  estimateLanguage?: string
  isVague?: boolean
}

/**
 * Build the WhatsApp-composed estimate graph. Zero-arg (stable contract): returns
 * an object exposing `.invoke(initialState)`. Per invocation it constructs the
 * WhatsApp adapter with the trusted tenant scope (companyId/ownerPhone) + inbound
 * messages captured in its closure, composes the shared channel-neutral graph
 * with that adapter, and runs it with the channel-neutral core state.
 */
export function buildEstimateGraph() {
  return {
    async invoke(initial: WhatsAppInitialState) {
      const supabase: SupabaseClient = requireServiceClient()
      const adapter = makeWhatsAppAdapter({
        companyId: initial.companyId,
        supabase,
        ownerPhone: initial.ownerPhone,
        messages: initial.messages ?? [],
      })
      const graph = buildSharedEstimateGraph(adapter)

      // OBS-01: unified Langfuse trace per WhatsApp estimate run.
      // Safe-metadata rule v4.2: only project/company IDs allowed — no sensitive data.
      const handler = new CallbackHandler({
        metadata: {
          langfuseSessionId: `whatsapp:${initial.projectId}`,
          langfuseUserId: initial.companyId,
        },
        tags: ['whatsapp', 'estimate-engine'],
      })

      // Core state is channel-neutral (D-07): ownerPhone/messages/currentMessage/
      // mediaResults are consumed by the adapter closure, NOT threaded as core
      // channels. `channel: 'whatsapp'` drives the generate-node opts.
      return await graph.invoke(
        {
          companyId: initial.companyId,
          projectId: initial.projectId,
          channel: 'whatsapp',
          estimateId: initial.estimateId,
          estimateLanguage: initial.estimateLanguage,
          isVague: initial.isVague,
        },
        { callbacks: [handler] }
      )
    },
  }
}
