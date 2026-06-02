/**
 * Phase 67: Inngest function — processes inbound WhatsApp messages via a
 * LangGraph StateGraph that fans out to parallel processMessage branches
 * (one per inbound message), converges at gather, then runs
 * generateEstimate → evaluateVagueness → askDetails | sendConfirmation.
 *
 * Implements:
 *   - INNGEST-07 (WhatsApp handler dispatches via Inngest)
 *   - INNGEST-06 (idempotent via event.data.batchKey)
 */
import { inngest } from '@/lib/inngest/client'
import { sendTypingIndicator } from '@/lib/whatsapp/client'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'
import {
  EVENT_WHATSAPP_PROCESS,
  type WhatsAppProcessPayload,
} from '@/lib/inngest/events'

export const whatsAppProcessJob = inngest.createFunction(
  {
    id: 'whatsapp-process',
    idempotency: 'event.data.batchKey',
    retries: 1,
    triggers: [{ event: EVENT_WHATSAPP_PROCESS }],
  },
  async ({ event, step }) => {
    const data = event.data as Omit<WhatsAppProcessPayload, 'messages'> & {
      messages: WhatsAppMessage[]
    }
    const { companyId, projectId, ownerPhone, messages } = data

    // Refresh typing indicator before AI generation (best-effort UX feedback).
    // This step stays outside the graph so it fires before the graph starts.
    await step.run('refresh-typing', async () => {
      const lastMsgId = messages[messages.length - 1]?.id
      if (lastMsgId) await sendTypingIndicator(lastMsgId).catch(() => undefined)
    })

    // All media processing + estimate generation + confirmation reply run inside
    // the LangGraph StateGraph. Fan-out is parallel (one processMessage branch per
    // inbound message); graph handles the full supervisor → gather → generate →
    // vagueness-check → send flow.
    return await step.run('orchestrate-estimate', async () => {
      const { buildEstimateGraph } = await import('@/lib/whatsapp/estimate-graph')
      const graph = buildEstimateGraph()
      return await graph.invoke({
        companyId,
        projectId,
        ownerPhone,
        messages,
        currentMessage: undefined,
        mediaResults: [],
        estimateId: undefined,
        estimateLanguage: undefined,
        isVague: undefined,
      })
    })
  }
)
