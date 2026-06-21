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

function normalizedPhoneDigits(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `1${digits}`
  return digits
}

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

    // Route 1: company_whatsapp.owner_phone — explicit owner registration.
    // This is the primary path: business owners register their personal WhatsApp
    // number against their company so their messages are always routed correctly,
    // even on the very first message before any conversation history exists.
    const { data: ownerRow } = await supabase
      .from('company_whatsapp')
      .select('company_id, user_id')   // user_id added for per-user conversation scoping
      .eq('owner_phone', `+${fromPhone}`)
      .eq('status', 'active')
      .maybeSingle()

    let resolvedCompanyId: string | null = ownerRow?.company_id ?? null
    let resolvedOwnerPhone: string | null = null   // track for conversation scoping
    let resolvedUserId: string | null = ownerRow?.user_id ?? null
    // Whether this message came from a registered owner (Route 1). Only owners get
    // the first-contact welcome — Routes 2-4 are fallbacks / client contacts.
    const resolvedViaOwner = Boolean(ownerRow?.company_id)

    // When Route 1 matches, capture the owner_phone for conversation scoping
    if (ownerRow) resolvedOwnerPhone = `+${fromPhone}`

    // Route 2: companies.phone fallback. This covers accounts created before
    // company_whatsapp.owner_phone was backfilled/synced; without it, first
    // owner audio messages are silently ignored and no project is created.
    if (!resolvedCompanyId) {
      const normalizedFromPhone = normalizedPhoneDigits(fromPhone)
      const last4 = normalizedFromPhone.slice(-4)
      const { data: companyRows } = await supabase
        .from('companies')
        .select('id, phone')
        .ilike('phone', `%${last4}%`)
        .limit(20)
      const match = (companyRows ?? []).find(
        (row: { id?: string | null; phone?: string | null }) =>
          normalizedPhoneDigits(row.phone) === normalizedFromPhone
      )
      resolvedCompanyId = match?.id ?? null
    }

    // Route 3: existing conversation thread (returning contacts who messaged before)
    if (!resolvedCompanyId) {
      const { data: convRow } = await supabase
        .from('whatsapp_conversations')
        .select('company_id')
        .eq('contact_phone', `+${fromPhone}`)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      resolvedCompanyId = convRow?.company_id ?? null
    }

    // Route 4: clients table (known client contacts)
    if (!resolvedCompanyId) {
      const { data: clientRow } = await supabase
        .from('clients')
        .select('company_id')
        .eq('phone', `+${fromPhone}`)
        .limit(1)
        .maybeSingle()
      resolvedCompanyId = clientRow?.company_id ?? null
    }

    if (!resolvedCompanyId) {
      console.warn('[WhatsApp] unknown inbound sender; no company resolved', {
        fromLast4: fromPhone.slice(-4),
      })
      await sendWhatsAppMessage(`+${fromPhone}`, {
        type: 'text',
        text: {
          body: "I couldn't find an Xtimator account for this phone number. Add this number to your company phone in Xtimator settings, then try again.",
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
