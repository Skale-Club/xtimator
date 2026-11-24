import { type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { verifyWebhookSignature } from '@/lib/whatsapp/verify'
import { acceptWhatsAppWebhook } from '@/lib/whatsapp/durable-ingress'
import type { WhatsAppPayload } from '@/lib/whatsapp/types'

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams
  const secret = process.env.META_WHATSAPP_VERIFY_TOKEN
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')
  if (secret && token && challenge && params.get('hub.mode') === 'subscribe' &&
      Buffer.byteLength(secret) === Buffer.byteLength(token) &&
      timingSafeEqual(Buffer.from(secret), Buffer.from(token))) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  if (!verifyWebhookSignature(rawBody, request.headers.get('x-hub-signature-256'),
    process.env.META_WHATSAPP_APP_SECRET ?? '')) return new Response('Unauthorized', { status: 401 })
  if (Buffer.byteLength(rawBody) > 1024 * 1024) return new Response('Payload too large', { status: 413 })

  let payload: WhatsAppPayload
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== 'object' ||
        (parsed as WhatsAppPayload).object !== 'whatsapp_business_account' ||
        !Array.isArray((parsed as WhatsAppPayload).entry)) return new Response('Invalid payload', { status: 400 })
    payload = parsed as WhatsAppPayload
    if (payload.entry.some(e => !e || !Array.isArray(e.changes) || e.changes.some(c =>
      !c || !c.value || typeof c.value !== 'object' ||
      (c.value.messages != null && !Array.isArray(c.value.messages)) ||
      (c.value.statuses != null && !Array.isArray(c.value.statuses))))) {
      return new Response('Invalid payload', { status: 400 })
    }
  } catch { return new Response('Invalid payload', { status: 400 }) }

  try {
    await acceptWhatsAppWebhook(rawBody, payload)
    return new Response('OK', { status: 200 })
  } catch {
    // A failed durable write must remain a provider retry, never a false ACK.
    console.error('[WhatsApp] webhook was not durably accepted')
    return new Response('Temporarily unavailable', { status: 503 })
  }
}
