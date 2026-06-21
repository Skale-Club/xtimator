/**
 * lib/estimate/adapters/whatsapp.ts
 *
 * WhatsApp ChannelAdapter (Phase 94, ENGINE-02 / CHAN-01).
 *
 * This is the ONLY place WhatsApp-specific estimate-graph code lives after the
 * canonical-graph extraction. It is a CLOSURE-FACTORY mirroring
 * makeQueryTools(companyId, supabase) — companyId / ownerPhone are captured in
 * the closure and are NEVER graph-input fields (the T-lrf-01 multi-tenant
 * isolation invariant). The returned ChannelAdapter exposes ONLY the three edge
 * behaviors the shared core injects: ingest / finalize / onError.
 *
 * What was relocated VERBATIM from lib/whatsapp/estimate-graph.ts:
 *   - ingest:   the supervisor → Send[] fan-out → processMessage (text/audio/
 *               image download + transcribe/vision + storage upload + recordings/
 *               photos inserts, never re-throw → mediaResults ok:false) → gather
 *               convergence → the has-usable-input precondition (mediaResults.some
 *               (ok)). The Send fan-out + the commutative mediaResults reducer
 *               (D-08) live HERE because they are WhatsApp inbound-media specific.
 *   - finalize: branch on state.isVague — askDetails (revertVagueEstimate +
 *               awaiting_details session + buildAskDetailsMessage reply) vs
 *               sendConfirmation (awaiting_confirm session + estimate read +
 *               'Estimate ready - ...' reply). The 3-fn adapter surface (D-05)
 *               folds the vague-vs-confirm branch inside finalize; Phase 96 splits
 *               a dedicated refine edge.
 *   - onError:  pick the copy by state.failure presence — generation-failed vs
 *               no-input (byte-identical to the source sendError node).
 *
 * The CORE state (lib/estimate/graph/state.ts) stays strictly channel-neutral.
 * The WhatsApp Send fan-out needs a state SHAPE with the WhatsApp-only fields, so
 * a WhatsApp-superset Annotation (WhatsAppEstimateState) is defined HERE — never
 * in the core.
 *
 * NOTE (deferred-decomposition concern per PITFALLS Pitfall 2): the
 * SESSION_TTL_MINUTES / expiresAt computation mints Date.now() inside finalize.
 * Today this is safe because the whole graph runs inside ONE atomic Inngest
 * step.run (DURABLE-02), so there is no behavior change. When AI-heavy nodes are
 * later promoted to their own step.run via the injected StepRunner, coalesce the
 * TTL from state instead of re-minting it on replay.
 */
import { Annotation, StateGraph, Send, START, END } from '@langchain/langgraph'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'
import { requireServiceClient } from '@/lib/supabase/service'
import { ingestMultimodal } from '@/lib/estimate/ingest/multimodal'
import {
  buildAskDetailsMessage,
  revertVagueEstimate,
} from '@/lib/whatsapp/ask-details'
import {
  downloadWhatsAppMedia,
  sendWhatsAppMessage,
} from '@/lib/whatsapp/client'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import { getServerStorage } from '@/lib/storage'
import { formatMoney } from '@/lib/money/currency'
import type { EstimateStateType } from '@/lib/estimate/graph/state'
import type { ChannelAdapter } from '@/lib/estimate/graph/types'
import { failureReasonToChannelCopy } from '@/lib/estimate/failure'

const SESSION_TTL_MINUTES = 30

// ---------------------------------------------------------------------------
// WhatsApp-superset ingest state (channel-specific — defined HERE, not in core)
//
// The core EstimateState (state.ts) is channel-neutral and carries none of the
// WhatsApp inbound-media fields. The adapter's internal Send fan-out needs a
// state SHAPE with those fields, so define the superset here. currentMessage is
// only populated during the processMessage fan-out via Send; it is optional so
// the base state (without the Send override) remains valid.
// ---------------------------------------------------------------------------

const WhatsAppEstimateState = Annotation.Root({
  companyId: Annotation<string>(),
  projectId: Annotation<string>(),
  ownerPhone: Annotation<string>(),
  messages: Annotation<WhatsAppMessage[]>(),
  currentMessage: Annotation<WhatsAppMessage | undefined>(),
  mediaResults: Annotation<Array<{ msgId: string; ok: boolean; reason?: string }>>({
    reducer: (cur, update) => [...cur, ...update],
    default: () => [],
  }),
})

type WhatsAppIngestState = typeof WhatsAppEstimateState.State

/**
 * WhatsApp ChannelAdapter closure-factory (ENGINE-02).
 *
 * companyId / ownerPhone are CLOSURE params (like makeQueryTools), NEVER graph or
 * adapter-input fields — keeping multi-tenant isolation a closure invariant.
 */
export function makeWhatsAppAdapter({
  companyId,
  supabase,
  ownerPhone,
  messages = [],
}: {
  companyId: string
  supabase: SupabaseClient
  ownerPhone: string
  /**
   * Inbound WhatsApp messages for this invocation. Closure-captured (like
   * companyId/ownerPhone) because the channel-neutral core state intentionally
   * does NOT carry WhatsApp fields (D-07) — the WhatsApp wiring supplies them to
   * the factory, not through graph state. Defaults to [] so the closure-factory
   * is also constructible without messages (e.g. the channel-adapter unit test).
   */
  messages?: WhatsAppMessage[]
}): ChannelAdapter {
  // -------------------------------------------------------------------------
  // ingest internals — the Send fan-out + per-message processing (relocated
  // verbatim from the supervisor / supervisorEdge / processMessage / gather
  // nodes of lib/whatsapp/estimate-graph.ts).
  // -------------------------------------------------------------------------

  // No-op node. The dynamic fan-out to processMessage happens in supervisorEdge
  // via Send — a LangGraph NODE must return a state update (object) or Command[],
  // NEVER a raw Send[] (that throws InvalidUpdateError). The Send[] belongs on
  // the conditional edge below.
  function supervisorNode(_state: WhatsAppIngestState): Partial<WhatsAppIngestState> {
    return {}
  }

  // Conditional edge for supervisor — map-reduce fan-out. Returns one Send per
  // message (each runs processMessage in parallel) or END when there are none.
  function supervisorEdge(state: WhatsAppIngestState): Send[] | typeof END {
    const msgs = state.messages ?? []
    if (msgs.length === 0) return END
    return msgs.map(
      (msg) => new Send('processMessage', { ...state, currentMessage: msg })
    )
  }

  async function processMessageNode(
    state: WhatsAppIngestState
  ): Promise<Partial<WhatsAppIngestState>> {
    const msg = state.currentMessage
    if (!msg) {
      return { mediaResults: [{ msgId: 'unknown', ok: false, reason: 'no_message' }] }
    }

    const { projectId } = state
    const msgId = msg.id

    try {
      if (msg.type === 'text' && msg.text?.body) {
        const svc = requireServiceClient()
        await svc.from('recordings').insert({
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
          const svc = requireServiceClient()
          await svc
            .from('whatsapp_messages')
            .update({ media_url: storagePath })
            .eq('wa_message_id', msgId)
            .eq('company_id', companyId)
        } catch {
          // Non-fatal — inbox falls back to emoji text if storage fails
        }

        let transcript: string
        try {
          // Route transcription through the shared, channel-neutral ingestion
          // path (UNIFY-01) instead of calling transcribeAudioOR directly. Same
          // fallback-wrapped primitive underneath; the Send[]/mediaResults batch
          // structure around it is unchanged. ingestMultimodal swallows a single
          // item failure and returns transcripts: [], so the empty-transcript
          // guard below preserves today's ok:false outcome for a failed item.
          const { transcripts } = await ingestMultimodal({
            audio: [
              { blob: new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), ext },
            ],
          })
          transcript = transcripts[0] ?? ''
        } catch (err) {
          console.error('[WhatsApp] audio transcription failed:', err)
          return { mediaResults: [{ msgId, ok: false, reason: 'transcription_failed' }] }
        }

        if (!transcript) return { mediaResults: [{ msgId, ok: false, reason: 'empty_transcript' }] }

        const svc = requireServiceClient()
        await svc.from('recordings').insert({
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

        const svc = requireServiceClient()
        await svc
          .from('whatsapp_messages')
          .update({ media_url: storagePath })
          .eq('wa_message_id', msgId)
          .eq('company_id', companyId)

        // Route vision through the shared, channel-neutral ingestion path
        // (UNIFY-01) instead of calling analyzePhotoOR directly. Same
        // fallback-wrapped primitive underneath; storage upload + photos insert
        // + mediaResults batch structure around it are unchanged.
        const { photoDescriptions } = await ingestMultimodal({
          photos: [{ base64: imageBuffer.toString('base64'), mimeType }],
        })
        const aiDescription = photoDescriptions[0] ?? ''

        await svc.from('photos').insert({
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

  // Convergence point — no-op (mirrors the source gather node).
  function gatherNode(_state: WhatsAppIngestState): Partial<WhatsAppIngestState> {
    return {}
  }

  // Internal WhatsApp media-ingestion graph: supervisor → Send[] fan-out →
  // processMessage[] (parallel) → gather. Compiled once and reused per ingest.
  const ingestGraph = new StateGraph(WhatsAppEstimateState)
    .addNode('supervisor', supervisorNode)
    .addNode('processMessage', processMessageNode)
    .addNode('gather', gatherNode)
    .addEdge(START, 'supervisor')
    .addConditionalEdges('supervisor', supervisorEdge, ['processMessage', END])
    .addEdge('processMessage', 'gather')
    .addEdge('gather', END)
    .compile()

  // -------------------------------------------------------------------------
  // The ChannelAdapter surface (D-05): ingest / finalize / onError.
  // -------------------------------------------------------------------------

  return {
    channel: 'whatsapp',

    /**
     * Turn raw WhatsApp inbound messages into persisted recordings/photos via the
     * internal Send fan-out, then enforce the has-usable-input precondition. NEVER
     * throws — a no-usable-input outcome becomes a `failure?` state channel so the
     * core routes to onError (preserving the source checkInputsEdge → sendError
     * semantics). The WhatsApp messages/ownerPhone are read from the (WhatsApp-
     * superset) initial state the WhatsApp wiring supplies.
     */
    async ingest(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      const result = await ingestGraph.invoke({
        companyId,
        projectId: state.projectId,
        ownerPhone,
        // Inbound messages come from the closure (the WhatsApp wiring supplies
        // them to the factory) — the channel-neutral core state does not carry
        // them. Fall back to any messages threaded through the (superset) initial
        // state for invokers that pass them through state instead.
        messages: messages.length
          ? messages
          : (state as unknown as WhatsAppIngestState).messages ?? [],
        currentMessage: undefined,
        mediaResults: [],
      })

      const hasUsableInput = (result.mediaResults ?? []).some((r) => r.ok)
      if (!hasUsableInput) {
        // No usable input — signal failure-as-state so the core's checkInputs
        // edge routes to the adapter's onError terminal (no-input reply copy).
        return { failure: { reason: 'no_usable_input' } }
      }
      return {}
    },

    /**
     * Deliver the result on WhatsApp. Branch on state.isVague (D-05, 3-fn
     * surface): vague → askDetails (revert the $0 estimate + awaiting_details
     * session + buildAskDetailsMessage reply); otherwise → sendConfirmation
     * (awaiting_confirm session + estimate read + 'Estimate ready - ...' reply).
     */
    async finalize(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      const { projectId, estimateId, estimateLanguage } = state

      if (state.isVague) {
        // --- askDetails (vague) ------------------------------------------------
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

        // estimateLanguage is guaranteed present at this node (set by generate)
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

      // --- sendConfirmation (usable estimate) ----------------------------------
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
    },

    /**
     * Terminal failure side-effect (the source sendError node). Reached from two
     * paths and picks the copy by state.failure presence (byte-identical copies):
     *   1. no usable input  → ingest set failure { reason: 'no_usable_input' }
     *   2. generation threw → generate set failure { reason: 'generation_failed' }
     * This is the LAST line of defense guaranteeing the owner always gets SOME
     * reply, turning the previously-silent failure into a visible, recoverable one.
     */
    async onError(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      // Source the reply copy from the single failure map (HARD-04). The exact
      // strings for generation_failed/no_usable_input are preserved verbatim there
      // (regression-gated). Falls back to the no-input copy when failure is unset.
      const body = failureReasonToChannelCopy(state.failure?.reason ?? 'no_usable_input')
      await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
      await logOutboundMessage(requireServiceClient(), {
        companyId,
        contactPhone: ownerPhone,
        body,
        msgType: 'text',
        status: 'sent',
      }).catch(() => undefined)
      return {}
    },
  }
}
