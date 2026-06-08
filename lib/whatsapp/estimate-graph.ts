/**
 * lib/whatsapp/estimate-graph.ts
 *
 * LangGraph StateGraph that replaces the sequential for-loop in
 * whatsapp-process.ts with parallel fan-out processMessage branches.
 *
 * Flow:
 *   START → supervisor → processMessage[] (parallel via Send)
 *        → gather → checkInputs conditional
 *        → generateEstimate → evaluateVagueness → checkVague conditional
 *        → askDetails | sendConfirmation | sendError → END
 */
import { Annotation, StateGraph, Send, START, END } from '@langchain/langgraph'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'
import { requireServiceClient } from '@/lib/supabase/service'
import { transcribeAudioOR, analyzePhotoOR } from '@/lib/ai/openrouter-client'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import {
  isVagueEstimate,
  buildAskDetailsMessage,
  revertVagueEstimate,
  type VagueCheckEstimate,
} from '@/lib/whatsapp/ask-details'
import {
  downloadWhatsAppMedia,
  sendWhatsAppMessage,
} from '@/lib/whatsapp/client'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import { getServerStorage } from '@/lib/storage'
import { formatMoney } from '@/lib/money/currency'

const SESSION_TTL_MINUTES = 30

// ---------------------------------------------------------------------------
// State definition
// ---------------------------------------------------------------------------

// currentMessage is only populated during processMessage fan-out via Send.
// It is optional so the base state (without Send override) remains valid.
const EstimateState = Annotation.Root({
  companyId: Annotation<string>(),
  projectId: Annotation<string>(),
  ownerPhone: Annotation<string>(),
  messages: Annotation<WhatsAppMessage[]>(),
  currentMessage: Annotation<WhatsAppMessage | undefined>(),
  mediaResults: Annotation<Array<{ msgId: string; ok: boolean; reason?: string }>>({
    reducer: (cur, update) => [...cur, ...update],
    default: () => [],
  }),
  estimateId: Annotation<string | undefined>(),
  estimateLanguage: Annotation<string | undefined>(),
  isVague: Annotation<boolean | undefined>(),
  // Set true when estimate generation throws (e.g. dead/missing OpenRouter key,
  // 401 "User not found", model missing). Routes to sendError so the owner always
  // gets a reply instead of the graph throwing → Inngest job dying silently.
  generationFailed: Annotation<boolean | undefined>(),
})

type EstimateStateType = typeof EstimateState.State

// ---------------------------------------------------------------------------
// Node: supervisor
// ---------------------------------------------------------------------------

// No-op node. The dynamic fan-out to processMessage happens in supervisorEdge
// via Send — a LangGraph NODE must return a state update (object) or Command[],
// NEVER a raw Send[] (that throws InvalidUpdateError). The Send[] belongs on the
// conditional edge below.
function supervisorNode(_state: EstimateStateType): Partial<EstimateStateType> {
  return {}
}

// Conditional edge for supervisor — map-reduce fan-out. Returns one Send per
// message (each runs processMessage in parallel) or END when there are none.
function supervisorEdge(state: EstimateStateType): Send[] | typeof END {
  const msgs = state.messages ?? []
  if (msgs.length === 0) return END
  return msgs.map(
    (msg) => new Send('processMessage', { ...state, currentMessage: msg })
  )
}

// ---------------------------------------------------------------------------
// Node: processMessage
// ---------------------------------------------------------------------------

async function processMessageNode(
  state: EstimateStateType
): Promise<Partial<EstimateStateType>> {
  const msg = state.currentMessage
  if (!msg) {
    return { mediaResults: [{ msgId: 'unknown', ok: false, reason: 'no_message' }] }
  }

  const { companyId, projectId } = state
  const msgId = msg.id

  try {
    if (msg.type === 'text' && msg.text?.body) {
      const supabase = requireServiceClient()
      await supabase.from('recordings').insert({
        project_id: projectId,
        company_id: companyId,
        storage_path: null,
        transcript: msg.text.body,
        duration_seconds: null,
      })
      return { mediaResults: [{ msgId, ok: true }] }
    }

    if (msg.type === 'audio' && msg.audio?.id) {
      // Derive MIME type and extension from the message — WhatsApp sends
      // "audio/ogg; codecs=opus" (Android) or "audio/mp4" (iOS). Strip the
      // codec parameter before splitting, and remap mp4 → m4a so OpenAI
      // Whisper can identify the container from the filename.
      const mimeType = (msg.audio.mime_type ?? 'audio/ogg').split(';')[0].trim()
      const rawExt = mimeType.split('/')[1] ?? 'ogg'
      const ext = rawExt === 'mp4' ? 'm4a' : rawExt

      let audioBuffer: Buffer
      try {
        audioBuffer = await downloadWhatsAppMedia(msg.audio.id)
      } catch (err) {
        console.error('[WhatsApp] audio download failed:', err)
        return { mediaResults: [{ msgId, ok: false, reason: 'download_failed' }] }
      }

      // Upload audio to private storage bucket BEFORE transcription so the
      // inbox can play it back even if transcription fails (e.g. missing key).
      const storagePath = `${companyId}/whatsapp/${msgId}.${ext}`
      try {
        await getServerStorage().upload('audio', storagePath, audioBuffer, {
          contentType: mimeType,
          upsert: false,
        })
        const supabase = requireServiceClient()
        await supabase
          .from('whatsapp_messages')
          .update({ media_url: storagePath })
          .eq('wa_message_id', msgId)
          .eq('company_id', companyId)
      } catch {
        // Non-fatal — inbox falls back to emoji text if storage fails
      }

      let transcript: string
      try {
        transcript = await transcribeAudioOR(
          new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
          ext
        )
      } catch (err) {
        console.error('[WhatsApp] audio transcription failed:', err)
        return { mediaResults: [{ msgId, ok: false, reason: 'transcription_failed' }] }
      }

      if (!transcript) return { mediaResults: [{ msgId, ok: false, reason: 'empty_transcript' }] }

      const supabase = requireServiceClient()
      await supabase.from('recordings').insert({
        project_id: projectId,
        company_id: companyId,
        storage_path: null,
        transcript,
        duration_seconds: null,
      })
      return { mediaResults: [{ msgId, ok: true }] }
    }

    if (msg.type === 'image' && msg.image?.id) {
      let imageBuffer: Buffer
      try {
        imageBuffer = await downloadWhatsAppMedia(msg.image.id)
      } catch (err) {
        console.error('[WhatsApp] image download failed:', err)
        return { mediaResults: [{ msgId, ok: false, reason: 'download_failed' }] }
      }

      const mimeType = msg.image.mime_type ?? 'image/jpeg'
      const ext = mimeType.split('/')[1] ?? 'jpg'
      const storagePath = `${companyId}/whatsapp/${projectId}-${msg.image.id}.${ext}`

      await getServerStorage().upload('photos', storagePath, imageBuffer, {
        contentType: mimeType,
        upsert: false,
      })

      const supabase = requireServiceClient()
      await supabase
        .from('whatsapp_messages')
        .update({ media_url: storagePath })
        .eq('wa_message_id', msgId)
        .eq('company_id', companyId)

      const aiDescription = await analyzePhotoOR(
        imageBuffer.toString('base64'),
        mimeType
      )

      await supabase.from('photos').insert({
        project_id: projectId,
        company_id: companyId,
        storage_path: storagePath,
        ai_description: aiDescription || null,
        caption: msg.image.caption ?? null,
        sort_order: 0,
      })
      return { mediaResults: [{ msgId, ok: true }] }
    }

    // Unknown message type — no-op (same as current behaviour)
    return { mediaResults: [{ msgId, ok: true }] }
  } catch (err) {
    // T-mq2-01: never re-throw — return ok:false so parallel branches continue
    console.error('[WhatsApp] processMessage unexpected error:', err)
    return {
      mediaResults: [
        { msgId, ok: false, reason: err instanceof Error ? err.message : 'unknown_error' },
      ],
    }
  }
}

// ---------------------------------------------------------------------------
// Node: gather (convergence point — no-op)
// ---------------------------------------------------------------------------

function gatherNode(_state: EstimateStateType): Partial<EstimateStateType> {
  return {}
}

// Edge function for checkInputs
function checkInputsEdge(state: EstimateStateType): string {
  return state.mediaResults.some((r) => r.ok) ? 'generateEstimate' : 'sendError'
}

// ---------------------------------------------------------------------------
// Node: generateEstimate
// ---------------------------------------------------------------------------

async function generateEstimateNode(
  state: EstimateStateType
): Promise<Partial<EstimateStateType>> {
  // NEVER re-throw: a throw here propagates out of graph.invoke → fails the
  // Inngest orchestrate-estimate step → job dies after retries with NO reply to
  // the owner (the recurring silent-failure bug). Instead, flag the failure and
  // let checkGenerated route to sendError so the owner always gets a reply.
  try {
    const result = await generateEstimateForProject(state.companyId, state.projectId)
    return {
      estimateId: result.estimateId,
      estimateLanguage: result.language,
    }
  } catch (err) {
    console.error('[WhatsApp] generateEstimate failed; routing to error reply:', err)
    return { generationFailed: true }
  }
}

// Edge function after generateEstimate: if generation threw, send the owner an
// error reply; otherwise continue to the vagueness check.
function checkGeneratedEdge(state: EstimateStateType): string {
  return state.generationFailed || !state.estimateId
    ? 'sendError'
    : 'evaluateVagueness'
}

// ---------------------------------------------------------------------------
// Node: evaluateVagueness
// ---------------------------------------------------------------------------

async function evaluateVaguenessNode(
  state: EstimateStateType
): Promise<Partial<EstimateStateType>> {
  const supabase = requireServiceClient()
  const { data: est } = await supabase
    .from('estimates')
    .select('total, sections:estimate_sections(items:estimate_items(id))')
    .eq('id', state.estimateId!)
    .single()
  const vague = isVagueEstimate(est as VagueCheckEstimate | null)
  return { isVague: vague }
}

// Edge function for checkVague
function checkVagueEdge(state: EstimateStateType): string {
  return state.isVague ? 'askDetails' : 'sendConfirmation'
}

// ---------------------------------------------------------------------------
// Node: askDetails
// ---------------------------------------------------------------------------

async function askDetailsNode(
  state: EstimateStateType
): Promise<Partial<EstimateStateType>> {
  const { companyId, projectId, ownerPhone, estimateId, estimateLanguage } = state
  const supabase = requireServiceClient()

  // Remove the $0 estimate and revert the project to draft so the next
  // inbound message regenerates cleanly against the same project.
  await revertVagueEstimate(supabase, projectId, estimateId ?? null)

  const expiresAt = new Date(
    Date.now() + SESSION_TTL_MINUTES * 60 * 1000
  ).toISOString()
  await supabase.from('whatsapp_sessions').insert({
    company_id: companyId,
    phone_number: ownerPhone,
    state: 'awaiting_details',
    draft_project_id: projectId,
    draft_estimate_id: null,
    expires_at: expiresAt,
  })

  // estimateLanguage is guaranteed present at this node (set by generateEstimate)
  // but we narrow defensively with a fallback to 'en'.
  const language = (estimateLanguage ?? 'en') as 'en' | 'pt' | 'es'
  const body = buildAskDetailsMessage(language)
  await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
  await logOutboundMessage(requireServiceClient(), {
    companyId,
    contactPhone: ownerPhone,
    body,
    msgType: 'text',
    status: 'sent',
  }).catch(() => undefined)

  return {}
}

// ---------------------------------------------------------------------------
// Node: sendConfirmation
// ---------------------------------------------------------------------------

async function sendConfirmationNode(
  state: EstimateStateType
): Promise<Partial<EstimateStateType>> {
  const { companyId, projectId, ownerPhone, estimateId } = state
  const supabase = requireServiceClient()

  const expiresAt = new Date(
    Date.now() + SESSION_TTL_MINUTES * 60 * 1000
  ).toISOString()
  await supabase.from('whatsapp_sessions').insert({
    company_id: companyId,
    phone_number: ownerPhone,
    state: 'awaiting_confirm',
    draft_project_id: projectId,
    draft_estimate_id: estimateId,
    expires_at: expiresAt,
  })

  const { data: estimate } = await supabase
    .from('estimates')
    .select('total, currency_code, summary, sections:estimate_sections(title, subtotal)')
    .eq('id', estimateId!)
    .single()

  const totalNum = (estimate as { total: number } | null)?.total ?? 0
  const currencyCode =
    (estimate as { currency_code: string | null } | null)?.currency_code ?? 'USD'
  const total = formatMoney(totalNum, currencyCode)
  const sectionRows =
    (estimate as {
      sections?: Array<{ title: string; subtotal: number }>
    } | null)?.sections ?? []
  const sections = sectionRows
    .map((s) => `- ${s.title}: ${formatMoney(s.subtotal, currencyCode)}`)
    .join('\n')

  const body = [
    `Estimate ready - ${total}`,
    '',
    sections,
    '',
    'Reply *send* to deliver to your client, or *cancel* to discard.',
  ].join('\n')

  await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
  await logOutboundMessage(requireServiceClient(), {
    companyId,
    contactPhone: ownerPhone,
    body,
    msgType: 'text',
    status: 'sent',
  }).catch(() => undefined)

  return {}
}

// ---------------------------------------------------------------------------
// Node: sendError
// ---------------------------------------------------------------------------

async function sendErrorNode(
  state: EstimateStateType
): Promise<Partial<EstimateStateType>> {
  const { companyId, ownerPhone } = state
  // Reached from two paths:
  //   1. checkInputsEdge — no usable input (audio couldn't be read, no transcript)
  //   2. checkGeneratedEdge — estimate generation threw (e.g. AI provider failure)
  // A single message covers both: ask the owner to retry / describe in text. This
  // is the LAST line of defense that guarantees the owner always gets SOME reply,
  // turning the previously-silent failure into a visible, recoverable one.
  const body = state.generationFailed
    ? "Sorry, I hit a problem generating your estimate. Please try again in a moment — if it keeps happening, describe the job in a text message."
    : "Sorry, I couldn't process your message. Please describe the job in a text message and I'll generate an estimate for you."
  await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
  await logOutboundMessage(requireServiceClient(), {
    companyId,
    contactPhone: ownerPhone,
    body,
    msgType: 'text',
    status: 'sent',
  }).catch(() => undefined)
  return {}
}

// ---------------------------------------------------------------------------
// Graph wiring
// ---------------------------------------------------------------------------

const graph = new StateGraph(EstimateState)
  .addNode('supervisor', supervisorNode)
  .addNode('processMessage', processMessageNode)
  .addNode('gather', gatherNode)
  .addNode('generateEstimate', generateEstimateNode)
  .addNode('evaluateVagueness', evaluateVaguenessNode)
  .addNode('askDetails', askDetailsNode)
  .addNode('sendConfirmation', sendConfirmationNode)
  .addNode('sendError', sendErrorNode)
  .addEdge(START, 'supervisor')
  .addConditionalEdges('supervisor', supervisorEdge, ['processMessage', END])
  .addEdge('processMessage', 'gather')
  .addConditionalEdges('gather', checkInputsEdge, ['generateEstimate', 'sendError'])
  .addConditionalEdges('generateEstimate', checkGeneratedEdge, ['evaluateVagueness', 'sendError'])
  .addConditionalEdges('evaluateVagueness', checkVagueEdge, ['askDetails', 'sendConfirmation'])
  .addEdge('askDetails', END)
  .addEdge('sendConfirmation', END)
  .addEdge('sendError', END)

export function buildEstimateGraph() {
  return graph.compile()
}
