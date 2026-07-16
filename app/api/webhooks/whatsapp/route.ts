import { type NextRequest } from 'next/server'
import { after } from 'next/server'
import { verifyWebhookSignature } from '@/lib/whatsapp/verify'
import { requireServiceClient } from '@/lib/supabase/service'
import { processInboundWithDebounce } from '@/lib/whatsapp/handler'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { welcomeOnFirstContact } from '@/lib/whatsapp/send-welcome'
import { logInboundMessage, type WaMsgType } from '@/lib/whatsapp/conversations'
import type { WhatsAppMessage, WhatsAppPayload } from '@/lib/whatsapp/types'
import { rateLimit } from '@/lib/ratelimit'
import { findActiveWhatsAppSender } from '@/lib/whatsapp/account-registry'

// Map a Meta inbound message to the inbox log's (type, body) pair.
function inboxFieldsFor(message: WhatsAppMessage): { msgType: WaMsgType; body: string | null } {
  switch (message.type) {
    case 'text':
      return { msgType: 'text', body: message.text?.body ?? null }
    case 'audio':
      return { msgType: 'audio', body: null }
    case 'image':
      return { msgType: 'image', body: message.image?.caption ?? null }
    case 'document':
      return { msgType: 'document', body: null }
    default:
      return { msgType: 'text', body: null }
  }
}

/**
 * Detect a `message_template_status_update` change in the webhook payload
 * (Phase 104.3). Meta delivers it under
 * `entry[].changes[].field === 'message_template_status_update'` with a
 * `value: { message_template_id, message_template_name, message_template_language,
 * event, reason? }`. The shared `WhatsAppPayload.field` type is narrowed to
 * 'messages', so we read the change loosely here without touching that type or
 * the inbound path. Returns null when no such change is present.
 */
function findTemplateStatusChange(payload: WhatsAppPayload): {
  message_template_id?: string
  message_template_name?: string
  message_template_language?: string
  event: string
  reason?: string
} | null {
  const entries = (payload as { entry?: Array<{ changes?: unknown[] }> })?.entry ?? []
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const c = change as { field?: string; value?: Record<string, unknown> }
      if (c.field === 'message_template_status_update' && c.value) {
        const v = c.value
        return {
          message_template_id: v.message_template_id as string | undefined,
          message_template_name: v.message_template_name as string | undefined,
          message_template_language: v.message_template_language as string | undefined,
          event: String(v.event ?? ''),
          reason: v.reason as string | undefined,
        }
      }
    }
  }
  return null
}

// ------------------------------------------------------------------
// GET: Meta webhook challenge verification (WA-02)
// Meta sends: hub.mode=subscribe, hub.verify_token, hub.challenge
// We must reply with hub.challenge as plain text to prove ownership.
// ------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.META_WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// ------------------------------------------------------------------
// POST: Inbound message handling (WA-01, WA-03)
//
// CRITICAL order:
//   1. request.text() FIRST — get raw body BEFORE any parsing
//   2. verifyWebhookSignature against raw body — never re-serialized JSON
//   3. JSON.parse after verification passes
//   4. Return 200 before processing (fire-and-forget via after())
// ------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // Step 1: raw body MUST come before JSON.parse (WA-01 pitfall)
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  console.info('[WhatsApp] webhook POST received', {
    hasSignature: Boolean(signature),
    bodyBytes: rawBody.length,
  })

  // Step 2: HMAC verification
  if (!verifyWebhookSignature(rawBody, signature, process.env.META_WHATSAPP_APP_SECRET ?? '')) {
    console.warn('[WhatsApp] webhook signature rejected', {
      hasSignature: Boolean(signature),
      appSecretConfigured: Boolean(process.env.META_WHATSAPP_APP_SECRET),
    })
    return new Response('Unauthorized', { status: 401 })
  }

  // Step 3: parse after verification
  const payload = JSON.parse(rawBody) as WhatsAppPayload

  // Step 4: status webhooks — early exit, no DB work needed (Pitfall 6)
  const isStatusUpdate = payload?.entry?.[0]?.changes?.[0]?.value?.statuses
  if (isStatusUpdate) {
    console.info('[WhatsApp] status webhook ignored')
    return new Response('OK', { status: 200 })
  }

  // Step 4b (Phase 104.3): message_template_status_update — Meta tells us a
  // template was approved/rejected/etc. Flip the stored template status. This is
  // ADDITIVE: it runs AFTER HMAC verification + the `statuses` early-exit and does
  // NOT touch the inbound-message routing below. Best-effort via after().
  const templateStatusChange = findTemplateStatusChange(payload)
  if (templateStatusChange) {
    after(async () => {
      try {
        const { applyTemplateStatusUpdate } = await import(
          '@/lib/actions/admin-whatsapp-templates'
        )
        await applyTemplateStatusUpdate({
          message_template_id: templateStatusChange.message_template_id,
          template_name: templateStatusChange.message_template_name,
          language: templateStatusChange.message_template_language,
          event: templateStatusChange.event,
          reason: templateStatusChange.reason,
        })
      } catch (err) {
        console.error('[WhatsApp] template status update error:', err)
      }
    })
    return new Response('OK', { status: 200 })
  }

  // Step 5: fire-and-forget inbound message processing (WA-01)
  // after() runs after the response is sent — Next.js 15+ feature (confirmed: v16.2.3)
  after(async () => {
    await handleInboundMessage(payload)
  })

  return new Response('OK', { status: 200 })
}

// ------------------------------------------------------------------
// handleInboundMessage: deduplication + routing stub
// Phase 42 will add full message processing logic here.
// ------------------------------------------------------------------
async function handleInboundMessage(payload: WhatsAppPayload): Promise<void> {
  try {
    const value = payload?.entry?.[0]?.changes?.[0]?.value
    const message = value?.messages?.[0]
    if (!message) return

    const messageId = message.id  // wamid.* — deduplication key (WA-03)
    const fromPhone = message.from // E.164 without leading +
    console.info('[WhatsApp] inbound message received', {
      messageId,
      type: message.type,
      fromLast4: fromPhone.slice(-4),
    })

    // Rate limit per phone (anti-abuse before any DB work or AI cost)
    const hourly = await rateLimit('whatsappPerHour', fromPhone)
    if (!hourly.allowed) {
      // Log only the last 4 digits — never full PII in logs (repo convention).
      console.warn('[WhatsApp] rate limit hit (hour):', fromPhone.slice(-4), hourly)
      return
    }
    const daily = await rateLimit('whatsappPerDay', fromPhone)
    if (!daily.allowed) {
      console.warn('[WhatsApp] rate limit hit (day):', fromPhone.slice(-4), daily)
      return
    }

    const supabase = requireServiceClient()

    // Route 1 (D-13): admin-provisioned authorized sender — the ONLY owner routing path.
    // The account-registry enforces exactly-one-active-sender-per-phone globally.
    const senderMatch = await findActiveWhatsAppSender(`+${fromPhone}`)

    let resolvedCompanyId: string | null = senderMatch?.companyId ?? null
    let resolvedOwnerPhone: string | null = null
    let resolvedUserId: string | null = senderMatch?.userId ?? null
    // Whether this message came from a registered owner (Route 1). Only owners get
    // the first-contact welcome — Routes 2-3 are fallbacks / client contacts.
    const resolvedViaOwner = Boolean(senderMatch?.companyId)

    // When Route 1 matches, capture the owner_phone for conversation scoping
    if (senderMatch) resolvedOwnerPhone = `+${fromPhone}`

    // Route 2 (D-14): existing conversation thread — returning contacts who messaged
    // before. Exactly-one rule: if the phone appears in multiple companies' conversations,
    // fail closed (ambiguous → no match).
    if (!resolvedCompanyId) {
      const { data: convRows } = await supabase
        .from('whatsapp_conversations')
        .select('company_id')
        .eq('contact_phone', `+${fromPhone}`)
        .order('last_message_at', { ascending: false })
        .limit(2)
      const uniqueCompanies = [...new Set((convRows ?? []).map((r: { company_id: string }) => r.company_id))]
      if (uniqueCompanies.length === 1) {
        resolvedCompanyId = uniqueCompanies[0]
      }
      // else: ambiguous (0 or >1 unique companies) → fail closed, continue to Route 3
    }

    // Route 3 (D-14): clients table — known client contacts. Exactly-one rule:
    // fail closed on ambiguity (same phone in multiple companies' client lists).
    if (!resolvedCompanyId) {
      const { data: clientRows } = await supabase
        .from('clients')
        .select('company_id')
        .eq('phone', `+${fromPhone}`)
        .limit(2)
      const uniqueClientCompanies = [...new Set((clientRows ?? []).map((r: { company_id: string }) => r.company_id))]
      if (uniqueClientCompanies.length === 1) {
        resolvedCompanyId = uniqueClientCompanies[0]
      }
      // else: ambiguous → fail closed
    }

    if (!resolvedCompanyId) {
      console.warn('[WhatsApp] unknown inbound sender; no company resolved', {
        fromLast4: fromPhone.slice(-4),
      })
      await sendWhatsAppMessage(`+${fromPhone}`, {
        type: 'text',
        text: {
          body: "I couldn't find an Xtimator account for this phone number. Please contact your administrator to have this number provisioned for WhatsApp routing.",
        },
      }).catch((sendErr) => {
        console.error('[WhatsApp] unknown sender reply failed:', sendErr)
      })
      return
    }
    console.info('[WhatsApp] inbound sender resolved', {
      companyId: resolvedCompanyId,
      fromLast4: fromPhone.slice(-4),
    })

    // Deduplication (WA-03): insert with PRIMARY KEY constraint
    // 23505 = unique_violation — message already processed
    const { error: dedupError } = await supabase
      .from('whatsapp_processed_messages')
      .insert({ message_id: messageId, company_id: resolvedCompanyId })

    if (dedupError?.code === '23505') {
      // Duplicate — silently discard
      console.info('[WhatsApp] duplicate inbound message ignored', { messageId })
      return
    }

    if (dedupError) {
      console.error('[WhatsApp] dedup insert error:', dedupError)
      return
    }

    // Inbox: persist the inbound message into its conversation thread (best-effort —
    // logging must never block message processing). Runs once per message (post-dedup).
    try {
      const { msgType, body } = inboxFieldsFor(message)
      await logInboundMessage(supabase, {
        companyId: resolvedCompanyId,
        contactPhone: `+${fromPhone}`,
        ownerPhone: resolvedOwnerPhone,     // scopes conversation to this user's number
        contactName: value?.contacts?.[0]?.profile?.name ?? null,
        body,
        msgType,
        waMessageId: messageId,
      })
    } catch (logErr) {
      console.error('[WhatsApp] inbox logInboundMessage error:', logErr)
    }

    // First-contact welcome (owners only). Atomic claim ensures it's sent once,
    // even across rapid back-to-back messages. Sent before processing so the
    // owner sees the welcome ahead of any estimate reply. Best-effort.
    if (resolvedViaOwner) {
      try {
        // Localized internally (companies.default_estimate_language cascade),
        // resolved only after the atomic claim is won — no select on repeat messages.
        await welcomeOnFirstContact(supabase, resolvedCompanyId, `+${fromPhone}`)
      } catch (welcomeErr) {
        console.error('[WhatsApp] first-contact welcome error:', welcomeErr)
      }
    }

    // Phase 42 + Phase 48: routes through debounce buffer when no session exists
    await processInboundWithDebounce(
      message,
      resolvedCompanyId,
      fromPhone,
      supabase
    )
  } catch (err) {
    // Never let errors propagate — after() runs post-response, uncaught errors are silent
    console.error('[WhatsApp] handleInboundMessage error:', err)
  }
}
