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
import { sendTypingIndicator, sendWhatsAppMessage } from '@/lib/whatsapp/client'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'
import {
  EVENT_WHATSAPP_PROCESS,
  EVENT_WHATSAPP_INTENT,
  type WhatsAppProcessPayload,
  type WhatsAppIntentPayload,
} from '@/lib/inngest/events'

// Last-line-of-defense reply. Sent when the estimate graph (or anything around it)
// throws so the owner is NEVER left with read+typing and total silence — the
// recurring whatsapp-inbound-no-reply bug. Best-effort: never throws.
const FALLBACK_ERROR_REPLY =
  "Sorry, I hit a problem generating your estimate. Please try again in a moment — if it keeps happening, describe the job in a text message."

async function sendFallbackReply(ownerPhone: string): Promise<void> {
  await sendWhatsAppMessage(ownerPhone, {
    type: 'text',
    text: { body: FALLBACK_ERROR_REPLY },
  }).catch((sendErr) => {
    console.error('[WhatsApp] fallback error reply failed:', sendErr)
  })
}

export const whatsAppProcessJob = inngest.createFunction(
  {
    id: 'whatsapp-process',
    idempotency: 'event.data.batchKey',
    retries: 1,
    // After all retries exhaust, guarantee the owner gets a reply instead of
    // silent read+typing. This is the durable fix for whatsapp-inbound-no-reply:
    // whatever killed the run (dead OpenRouter key, transcription failure, etc.),
    // the owner is told to retry rather than left waiting forever.
    onFailure: async ({ event }) => {
      const payload = (event as { data?: { event?: { data?: WhatsAppProcessPayload } } })
        .data?.event?.data
      if (payload?.ownerPhone) await sendFallbackReply(payload.ownerPhone)
    },
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

/**
 * Quick task 260603-lrf — whatsAppIntentRouterJob.
 *
 * Runs the intent-router graph for session-state inbound (dispatched by
 * handler.ts as EVENT_WHATSAPP_INTENT for awaiting_confirm). Heavy work
 * (normalization: audio download + Whisper, the classifier LLM call) runs OFF
 * the Meta webhook ack path. Idempotent via event.data.batchKey (wa-intent-{id}).
 *
 * whatsAppProcessJob (the CREATE path above) is intentionally untouched.
 */
export const whatsAppIntentRouterJob = inngest.createFunction(
  {
    id: 'whatsapp-intent',
    idempotency: 'event.data.batchKey',
    retries: 1,
    triggers: [{ event: EVENT_WHATSAPP_INTENT }],
  },
  async ({ event, step }) => {
    const data = event.data as Omit<WhatsAppIntentPayload, 'message'> & {
      message: WhatsAppMessage
    }
    const { companyId, ownerPhone, fromPhone, message, session } = data

    // Refresh typing indicator before the (slower) classify work — best-effort.
    await step.run('refresh-typing', async () => {
      if (message?.id) await sendTypingIndicator(message.id).catch(() => undefined)
    })

    return await step.run('route-intent', async () => {
      const { classifyAndRoute } = await import('@/lib/whatsapp/intent-router')
      const { requireServiceClient } = await import('@/lib/supabase/service')
      await classifyAndRoute({
        companyId,
        ownerPhone,
        fromPhone,
        message,
        session,
        supabase: requireServiceClient(),
      })
      return { routed: true }
    })
  }
)
