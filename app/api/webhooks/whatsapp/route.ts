import { type NextRequest } from 'next/server'
import { after } from 'next/server'
import { verifyWebhookSignature } from '@/lib/whatsapp/verify'
import { requireServiceClient } from '@/lib/supabase/service'
import { processInboundMessage } from '@/lib/whatsapp/handler'
import type { WhatsAppPayload } from '@/lib/whatsapp/types'

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

  // Step 2: HMAC verification
  if (!verifyWebhookSignature(rawBody, signature, process.env.META_WHATSAPP_APP_SECRET ?? '')) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Step 3: parse after verification
  const payload = JSON.parse(rawBody) as WhatsAppPayload

  // Step 4: status webhooks — early exit, no DB work needed (Pitfall 6)
  const isStatusUpdate = payload?.entry?.[0]?.changes?.[0]?.value?.statuses
  if (isStatusUpdate) return new Response('OK', { status: 200 })

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

    const supabase = requireServiceClient()

    // Route: find company by phone number
    // phone_number stored as E.164 with '+', Meta sends without '+'
    const { data: whatsappConfig } = await supabase
      .from('company_whatsapp')
      .select('company_id')
      .eq('phone_number', `+${fromPhone}`)
      .eq('status', 'active')
      .single()

    if (!whatsappConfig) {
      // Unregistered or inactive number — silent ignore per WA-06
      return
    }

    // Deduplication (WA-03): insert with PRIMARY KEY constraint
    // 23505 = unique_violation — message already processed
    const { error: dedupError } = await supabase
      .from('whatsapp_processed_messages')
      .insert({ message_id: messageId, company_id: whatsappConfig.company_id })

    if (dedupError?.code === '23505') {
      // Duplicate — silently discard
      return
    }

    if (dedupError) {
      console.error('[WhatsApp] dedup insert error:', dedupError)
      return
    }

    // Phase 42: full inbound processing
    await processInboundMessage(
      message,
      whatsappConfig.company_id as string,
      fromPhone,
      supabase
    )
  } catch (err) {
    // Never let errors propagate — after() runs post-response, uncaught errors are silent
    console.error('[WhatsApp] handleInboundMessage error:', err)
  }
}
