/**
 * Phase 42: WhatsApp Inbound Processing
 * Phase 48: Multi-message debounce (SEED-010) — aggregates messages within a
 *           5-second window into a single estimate.
 * Phase 67: Inngest dispatch (INNGEST-07) — processInboundMessages no longer
 *           runs Whisper / Vision / generate-estimate inline. Pre-flight stays
 *           (entitlements, draft project), then the batch is dispatched to
 *           the whatsAppProcessJob Inngest function so the Meta webhook ack
 *           returns in <1s regardless of inbound media size.
 *
 * Quick task 260603-lrf: the awaiting_confirm branch no longer rejects
 *           non-text media with a canned "reply send or cancel". It now
 *           dispatches EVENT_WHATSAPP_INTENT (single message + session snapshot)
 *           so the intent-router graph — running in Inngest, off the webhook ack
 *           path — normalizes the message (audio→transcript, photo→analysis,
 *           text→as-is) and classifies it into CONFIRM_OR_CANCEL / EDIT / CREATE
 *           / QUERY. This mirrors how the no-session path dispatches
 *           EVENT_WHATSAPP_PROCESS. The awaiting_details debounce path is left
 *           exactly as-is (multi-message continuation must be preserved); only
 *           awaiting_confirm is rerouted through the classifier.
 *
 * Processes inbound WhatsApp messages from business owners.
 * After dispatch, the worker handles audio/text/image ingestion + estimate
 * generation + confirmation reply.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendWhatsAppMessage, // still used by processInboundMessages (entitlement rejection)
  markMessageAsRead,
  sendTypingIndicator,
} from '@/lib/whatsapp/client'
import { getEntitlementsForTier } from '@/lib/entitlements-server'
import { checkCredits } from '@/lib/billing/credit-ledger'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import { PLACEHOLDER_PREFIX } from '@/lib/constants/project'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'
import {
  pushToBuffer,
  tryClaimBuffer,
  debounceWait,
} from '@/lib/whatsapp/buffer'

// -------------------------------------------------------------------------
// Entry point — webhook route calls this fire-and-forget.
//
// Phase 48: routes to debounce buffer when no session exists (so multiple
// messages collapse into one estimate). When a session exists, the message
// goes straight to the legacy single-message path which delegates to confirm.
// -------------------------------------------------------------------------
export async function processInboundWithDebounce(
  message: WhatsAppMessage,
  companyId: string,
  fromPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  const ownerPhone = `+${fromPhone}`

  // UX feedback first — both paths benefit
  await markMessageAsRead(message.id).catch(() => undefined)
  await sendTypingIndicator(message.id).catch(() => undefined)

  // Check for active session — if found, skip debounce (confirmation flow)
  const { data: existingSession } = await supabase
    .from('whatsapp_sessions')
    .select('id, state, draft_project_id, draft_estimate_id')
    .eq('company_id', companyId)
    .eq('phone_number', ownerPhone)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existingSession?.state === 'awaiting_confirm') {
    // Quick task 260603-lrf: dispatch the single message + session snapshot to
    // the intent router (Inngest) instead of the old canned reminder. The router
    // normalizes audio/photo→text and classifies CONFIRM_OR_CANCEL/EDIT/CREATE/
    // QUERY. Read receipt + typing already fired above, before this dispatch.
    return dispatchIntentRouter(
      message,
      existingSession as { id: string; state: string; draft_project_id: string | null; draft_estimate_id: string | null },
      companyId,
      ownerPhone,
      fromPhone,
    )
  }

  if (existingSession?.state === 'awaiting_details') {
    // The owner is supplying more detail for the SAME draft project.
    // Use the same rolling debounce so rapid multi-message bursts collapse into
    // one Inngest dispatch. After claiming the buffer, re-query the session
    // (still active — 30 min TTL) to recover draft_project_id.
    const pushedDetails = await pushToBuffer(fromPhone, message)
    if (!pushedDetails) {
      // Redis unavailable — fall back to immediate single-message dispatch
      return dispatchToExistingProject(
        [message],
        existingSession as { draft_project_id: string | null },
        companyId,
        ownerPhone,
      )
    }
    await debounceWait()
    await sendTypingIndicator(message.id).catch(() => undefined)
    const detailsBatch = await tryClaimBuffer(fromPhone, message.id)
    if (!detailsBatch) return  // Newer message is processing
    const { data: freshSession } = await supabase
      .from('whatsapp_sessions')
      .select('draft_project_id')
      .eq('company_id', companyId)
      .eq('phone_number', ownerPhone)
      .eq('state', 'awaiting_details')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!freshSession?.draft_project_id) return
    return dispatchToExistingProject(
      detailsBatch.map((b) => b.message),
      freshSession,
      companyId,
      ownerPhone,
    )
  }

  // No session → debounce path
  const pushed = await pushToBuffer(fromPhone, message)
  if (!pushed) {
    // Redis unavailable — classify this single message via the intent router
    // (CREATE vs QUERY vs ...). Quick task 260603-lrf: standalone questions like
    // "qual o último estimate do cliente X" must reach the QUERY path even with
    // no active session, instead of always creating an estimate.
    return dispatchIntentRouter(message, null, companyId, ownerPhone, fromPhone)
  }

  // Wait for the debounce window. If a newer message arrives during the wait,
  // its own worker will become the winner and ours will exit silently below.
  await debounceWait()

  // Refresh typing indicator (the original one is expiring on Meta's side)
  await sendTypingIndicator(message.id)

  const batch = await tryClaimBuffer(fromPhone, message.id)
  if (!batch) return  // Someone newer is processing

  // A single message with no session → run the AI intent classifier so standalone
  // QUERY ("qual o último estimate do cliente X") is answered instead of creating
  // an estimate. A multi-message burst is a job description split across messages
  // → go straight to the batch CREATE path (preserves debounce-collapse behavior).
  if (batch.length === 1) {
    return dispatchIntentRouter(batch[0].message, null, companyId, ownerPhone, fromPhone)
  }
  await processInboundMessages(
    batch.map((b) => b.message),
    companyId,
    fromPhone,
    supabase
  )
}

// -------------------------------------------------------------------------
// Backwards-compat entry — calls processInboundWithDebounce internally.
// Kept so existing tests / direct callers don't break.
// -------------------------------------------------------------------------
export async function processInboundMessage(
  message: WhatsAppMessage,
  companyId: string,
  fromPhone: string,  // E.164 without leading +
  supabase: SupabaseClient
): Promise<void> {
  const ownerPhone = `+${fromPhone}`

  // 0. UX feedback: mark as read + show typing indicator (fire-and-forget)
  // These keep the user reassured during the 20-40s of AI work that follows.
  // Meta API failures are swallowed inside markMessageAsRead/sendTypingIndicator.
  await markMessageAsRead(message.id).catch(() => undefined)
  await sendTypingIndicator(message.id).catch(() => undefined)

  // 1. Check for active awaiting_confirm session — Phase 43 handles confirm/cancel replies
  const { data: existingSession } = await supabase
    .from('whatsapp_sessions')
    .select('id, state, draft_project_id, draft_estimate_id')
    .eq('company_id', companyId)
    .eq('phone_number', ownerPhone)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existingSession?.state === 'awaiting_confirm') {
    // Quick task 260603-lrf: route through the intent classifier (see twin in
    // processInboundWithDebounce). No more canned send/cancel reminder.
    return dispatchIntentRouter(
      message,
      existingSession as { id: string; state: string; draft_project_id: string | null; draft_estimate_id: string | null },
      companyId,
      ownerPhone,
      fromPhone,
    )
  }

  if (existingSession?.state === 'awaiting_details') {
    const pushedDetails = await pushToBuffer(fromPhone, message)
    if (!pushedDetails) {
      return dispatchToExistingProject(
        [message],
        existingSession as { draft_project_id: string | null },
        companyId,
        ownerPhone,
      )
    }
    await debounceWait()
    await sendTypingIndicator(message.id).catch(() => undefined)
    const detailsBatch = await tryClaimBuffer(fromPhone, message.id)
    if (!detailsBatch) return
    const { data: freshSession } = await supabase
      .from('whatsapp_sessions')
      .select('draft_project_id')
      .eq('company_id', companyId)
      .eq('phone_number', ownerPhone)
      .eq('state', 'awaiting_details')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!freshSession?.draft_project_id) return
    return dispatchToExistingProject(
      detailsBatch.map((b) => b.message),
      freshSession,
      companyId,
      ownerPhone,
    )
  }

  // No session → process this single message directly (used by legacy paths and
  // by the Redis-unavailable fallback in processInboundWithDebounce)
  return processInboundMessages([message], companyId, fromPhone, supabase)
}

// -------------------------------------------------------------------------
// awaiting_confirm dispatch — Quick task 260603-lrf.
//
// Sends a single message + session snapshot to the intent-router Inngest job
// (whatsAppIntentRouterJob) via EVENT_WHATSAPP_INTENT. The heavy work
// (normalization + classifier LLM) runs off the Meta webhook ack path. Mirrors
// processInboundMessages' dynamic-import dispatch pattern. Idempotent via the
// wamid batchKey (`wa-intent-{messageId}`).
//
// ownerPhone carries the leading '+'; fromPhone does NOT (the shape
// processInboundMessages expects for the CREATE branch inside the router).
// -------------------------------------------------------------------------
async function dispatchIntentRouter(
  message: WhatsAppMessage,
  session: { id: string; state: string; draft_project_id: string | null; draft_estimate_id: string | null } | null,
  companyId: string,
  ownerPhone: string,
  fromPhone: string,
): Promise<void> {
  const batchKey = `wa-intent-${message.id}`
  const { inngest } = await import('@/lib/inngest/client')
  const { EVENT_WHATSAPP_INTENT } = await import('@/lib/inngest/events')
  await inngest.send({
    name: EVENT_WHATSAPP_INTENT,
    id: batchKey,
    data: {
      companyId,
      ownerPhone,
      fromPhone,
      message,
      session,
      batchKey,
    },
  })
}

// -------------------------------------------------------------------------
// awaiting_details re-dispatch — Quick task 260529-lc0.
//
// When a session is in awaiting_details, the owner is supplying more detail for
// the SAME draft project. Re-dispatch EVENT_WHATSAPP_PROCESS with the existing
// draft_project_id so the worker accumulates context (recordings/photos) and
// regenerates. No new project, no debounce. Idempotent via the wamid batchKey.
//
// The entitlement gate is intentionally NOT re-checked here: the session only
// exists because the first processing (which did check entitlement) passed, and
// the owner is continuing the same conversation.
// -------------------------------------------------------------------------
async function dispatchToExistingProject(
  messages: WhatsAppMessage[],
  session: { draft_project_id: string | null },
  companyId: string,
  ownerPhone: string,
): Promise<void> {
  if (!messages.length || !session.draft_project_id) return
  const lastMessageId = messages[messages.length - 1].id
  const batchKey = `wa-batch-${lastMessageId}`
  const { inngest } = await import('@/lib/inngest/client')
  const { EVENT_WHATSAPP_PROCESS } = await import('@/lib/inngest/events')
  await inngest.send({
    name: EVENT_WHATSAPP_PROCESS,
    id: batchKey,
    data: {
      companyId,
      projectId: session.draft_project_id, // SAME project — accumulate context
      ownerPhone,
      messages,
      batchKey,
    },
  })
}

// -------------------------------------------------------------------------
// Multi-message processor — Phase 67 refactor: dispatch only.
//
// Pre-flight (cheap, <1s):
//   - Entitlement check (free tier rejection — never creates orphan drafts)
//   - Draft project creation (provides a stable project_id for the worker)
//
// Dispatch: ONE Inngest event per batch. The whatsAppProcessJob function
// (Plan 67-02) does Whisper / Vision / generate-estimate / session create /
// confirmation reply inside step.run blocks — checkpointed and retriable.
//
// Idempotency: event id = `wa-batch-{lastMessageId}`. lastMessageId is the
// Meta wamid, globally unique, so duplicate webhook redeliveries collapse
// to one Inngest run via two layers: event-level id + function-level
// idempotency: 'event.data.batchKey'.
// -------------------------------------------------------------------------
export async function processInboundMessages(
  messages: WhatsAppMessage[],
  companyId: string,
  fromPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  if (messages.length === 0) return
  const ownerPhone = `+${fromPhone}`

  // QUOTA-05: Check WhatsApp entitlement BEFORE any project draft / dispatch.
  // Free tier rejection happens here so we never create orphan drafts.
  const { data: companyRow } = await supabase
    .from('companies')
    .select('tier')
    .eq('id', companyId)
    .single()
  const tier = (companyRow as { tier: string } | null)?.tier ?? 'free'
  const entitlements = await getEntitlementsForTier(tier)

  if (!entitlements.whatsappEnabled) {
    const body = 'WhatsApp channel is not available on your current plan. Upgrade at /settings/billing'
    await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
    logOutboundMessage(supabase, {
      companyId,
      contactPhone: ownerPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    return
  }

  // Billing v2 credit gate — mirrors the web generate route: a spent balance
  // blocks the (expensive) WhatsApp estimate-creation pipeline BEFORE any draft
  // or media ingest. BYOK bypass + the enforcement flag live inside checkCredits.
  const credit = await checkCredits(supabase, companyId, 1)
  if (!credit.allowed) {
    const body =
      "You're out of AI credits — upgrade or top up at /settings/billing to keep creating estimates."
    await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
    logOutboundMessage(supabase, {
      companyId,
      contactPhone: ownerPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    return
  }

  const lastMessageId = messages[messages.length - 1].id

  // Create a single draft project for the entire batch (cheap, <1s).
  // Keep here (not in Inngest function) so the dispatch payload references
  // a real projectId — easier debugging and the project_id is needed by
  // the per-message step.run blocks for correlation.
  const placeholderName = `${PLACEHOLDER_PREFIX}WhatsApp`
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      company_id: companyId,
      client_id: null,
      name: placeholderName,
      project_type: null,
      input_mode: null,
      status: 'draft',
      target_budget: null,
      total: 0,
    })
    .select('id')
    .single()

  if (projectError || !project) {
    console.error('[WhatsApp] Failed to create project:', projectError)
    return
  }
  const projectId = (project as { id: string }).id
  console.info('[WhatsApp] draft project created for inbound batch', {
    companyId,
    projectId,
    messageCount: messages.length,
    lastMessageId,
  })

  // Dispatch the whole batch to Inngest. ONE event for the entire batch —
  // simpler than per-message events because the Inngest function already
  // iterates over messages with one step.run per message (Plan 67-02 design).
  // Idempotency: lastMessageId is unique per Meta system (wamid), so
  // duplicate webhook redeliveries collapse to ONE Inngest run.
  const { inngest } = await import('@/lib/inngest/client')
  const { EVENT_WHATSAPP_PROCESS } = await import('@/lib/inngest/events')
  const batchKey = `wa-batch-${lastMessageId}`

  await inngest.send({
    name: EVENT_WHATSAPP_PROCESS,
    id: batchKey,
    data: {
      companyId,
      projectId,
      ownerPhone,
      messages,
      batchKey,
    },
  })
  console.info('[WhatsApp] inbound batch dispatched to Inngest', {
    companyId,
    projectId,
    batchKey,
  })

  // Phase 77 NOTIF-04: in-app notification for inbound WhatsApp.
  // Dedupe by lastMessageId (Meta wamid is globally unique → webhook retries
  // collapse to a single notification).
  try {
    const { notify } = await import('@/lib/notifications/dispatch')
    const { buildNotificationCopy } = await import('@/lib/notifications/copy')
    const copy = buildNotificationCopy('whatsapp.inbound', {
      whatsappFrom: ownerPhone,
    })
    const { data: companyOwner } = await supabase
      .from('companies')
      .select('user_id')
      .eq('id', companyId)
      .single()
    void notify({
      companyId,
      userId: (companyOwner as { user_id?: string | null } | null)?.user_id ?? null,
      eventType: 'whatsapp.inbound',
      title: copy.title,
      body: copy.body,
      linkUrl: `/projects/${projectId}`,
      resourceType: 'whatsapp_message',
      resourceId: lastMessageId,
      metadata: { dedupe_key: `wa-${lastMessageId}` },
    })
  } catch {
    /* best-effort */
  }
  // Returns immediately — webhook ack closes the loop on Meta in <1s.
  // The whatsAppProcessJob Inngest function (Plan 67-02) does the rest:
  // per-message Whisper/Vision/save + generate-estimate + confirm reply.
}
