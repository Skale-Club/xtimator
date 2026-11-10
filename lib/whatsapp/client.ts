/**
 * Thin typed wrapper around Meta Graph API v21.0.
 * All calls are server-side only — never import from client components.
 */

import { getWhatsAppPlatformConfig } from '@/lib/platform-config'
import { sanitizeWhatsAppParam } from '@/lib/notifications/template-engine'
import { isWhatsAppOutboundBlocked, logOutboundBlocked } from '@/lib/whatsapp/outbound-guard'
import { MediaTooLargeError, isOverMediaLimit, mediaKindFromMime } from '@/lib/whatsapp/message-policy'
import {
  marketFromPhone,
  recordMessagingEvent,
  resolveBillable,
  type MessagingMeta,
} from '@/lib/billing/messaging-events'

const GRAPH_BASE = `https://graph.facebook.com/${process.env.META_WHATSAPP_API_VERSION ?? 'v21.0'}`

/**
 * Send a WhatsApp message to a recipient phone number (E.164).
 * body should be a partial Messages API object (type + content fields).
 *
 * Returns the Meta message id (wamid) when Meta reports one, else null (also null
 * when the development kill switch blocks the send). After a successful send a
 * `messaging_cost_events` row is recorded (status 'sent', cost unknown until Meta's
 * delivered webhook prices it) with the attribution in `meta`: who pays
 * (`companyId`), why (`purpose`) and whether it is passed to the customer's credits
 * (`billable`; platform purposes such as the welcome sequence are never billable).
 * Recording is best-effort and never throws into the send path. A caller that
 * passes no `meta` is recorded as 'unclassified' and non-billable, so a missed call
 * site costs us visibility, never a wrong charge.
 */
export async function sendWhatsAppMessage(
  to: string,
  body: object,
  meta?: MessagingMeta
): Promise<string | null> {
  if (isWhatsAppOutboundBlocked()) {
    logOutboundBlocked((body as { type?: string }).type ?? 'message', to)
    return null
  }
  const { accessToken: token, phoneNumberId } = await getWhatsAppPlatformConfig()
  if (!token || !phoneNumberId) throw new Error('[WhatsApp] Missing platform config: access token or phone number ID not set')
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, ...body }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[WhatsApp] sendMessage failed ${res.status}: ${text}`)
  }
  const wamid = await readWamid(res)
  if (wamid) {
    const attribution: MessagingMeta = meta ?? { companyId: null, purpose: 'unclassified', billable: false }
    // Awaited so a serverless runtime does not drop it, but it can never throw.
    await recordMessagingEvent({
      companyId: attribution.companyId ?? null,
      channel: 'whatsapp',
      provider: 'meta',
      providerMessageId: wamid,
      purpose: attribution.purpose,
      billable: resolveBillable(attribution),
      market: marketFromPhone(to),
      status: 'sent',
    })
  }
  return wamid
}

/** Meta's send response: { messages: [{ id }] }. Anything else (or a non-JSON body) -> null. */
async function readWamid(res: Response): Promise<string | null> {
  try {
    const json = (await res.json()) as { messages?: Array<{ id?: string }> }
    const id = json?.messages?.[0]?.id
    return typeof id === 'string' && id.length > 0 ? id : null
  } catch {
    return null
  }
}

/**
 * Send a pre-approved WhatsApp **template** (HSM) message.
 *
 * Unlike sendWhatsAppMessage (free-form text/document), template messages are the
 * ONLY way to start a business-initiated conversation OUTSIDE Meta's 24-hour
 * customer-service window — i.e. the only way to send a real "notification" the
 * owner hasn't just messaged us about. The template must already exist and be
 * APPROVED in Meta WhatsApp Manager under our WABA; `name` + `languageCode` must
 * match it exactly, and the variable arrays must match the `{{n}}` placeholders.
 *
 * Payload shape ported from the xphere Cloud integration (sendCloudTemplate):
 *   { type: 'template', template: { name, language:{code}, components: [...] } }
 * Header variables (text only) and body variables are each their own component,
 * with parameters in `{{n}}` order.
 *
 * Reuses sendWhatsAppMessage so token/phoneNumberId resolution and error handling
 * stay in one place. Throws on a non-2xx Meta response (same contract).
 *
 * Every header/body variable is sanitized via sanitizeWhatsAppParam (TMPL-07)
 * before it reaches Meta — strips newlines/tabs, collapses 4+ consecutive
 * spaces, trims leading/trailing whitespace — closing the previously
 * unsanitized pass-through gap.
 */
export async function sendWhatsAppTemplate(
  to: string,
  opts: {
    name: string
    languageCode: string
    bodyVariables?: string[]
    headerVariables?: string[]
  },
  meta?: MessagingMeta
): Promise<string | null> {
  const headerVariables = opts.headerVariables?.map(sanitizeWhatsAppParam)
  const bodyVariables = opts.bodyVariables?.map(sanitizeWhatsAppParam)

  const components: Array<Record<string, unknown>> = []
  if (headerVariables && headerVariables.length > 0) {
    components.push({
      type: 'header',
      parameters: headerVariables.map((text) => ({ type: 'text', text })),
    })
  }
  if (bodyVariables && bodyVariables.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyVariables.map((text) => ({ type: 'text', text })),
    })
  }

  return sendWhatsAppMessage(
    to,
    {
      type: 'template',
      template: {
        name: opts.name,
        language: { code: opts.languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    },
    meta
  )
}

/**
 * Mark an inbound message as read (blue checks appear on user's phone).
 * Fire-and-forget — failures are swallowed and logged. Never blocks processing.
 *
 * Meta docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/mark-message-as-read
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
  if (isWhatsAppOutboundBlocked()) {
    logOutboundBlocked('read_receipt')
    return
  }
  const { accessToken: token, phoneNumberId } = await getWhatsAppPlatformConfig()
  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    })
    if (!res.ok) {
      console.warn('[WhatsApp] markMessageAsRead failed', res.status, await res.text())
    }
  } catch (err) {
    console.warn('[WhatsApp] markMessageAsRead error', err)
  }
}

/**
 * Send "typing…" indicator to the user. Lasts ~25s on Meta's side or until the next
 * outbound message replaces it. Re-send before the 25s mark for long-running work.
 *
 * Combines mark-as-read with typing — Meta's API uses a single call.
 * Fire-and-forget — failures swallowed.
 */
export async function sendTypingIndicator(messageId: string): Promise<void> {
  if (isWhatsAppOutboundBlocked()) {
    logOutboundBlocked('typing_indicator')
    return
  }
  const { accessToken: token, phoneNumberId } = await getWhatsAppPlatformConfig()
  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
    })
    if (!res.ok) {
      console.warn('[WhatsApp] sendTypingIndicator failed', res.status, await res.text())
    }
  } catch (err) {
    console.warn('[WhatsApp] sendTypingIndicator error', err)
  }
}

/**
 * Download a media file from WhatsApp Cloud API.
 * Two-step: (1) resolve media URL + metadata via mediaId, (2) download binary.
 *
 * Size guard: step 1 returns Meta's `file_size` and `mime_type`. When the file is over
 * the limit for its kind (audio/image, see message-policy.ts, or an explicit
 * `opts.maxBytes`) a MediaTooLargeError is thrown BEFORE step 2, so nothing is downloaded.
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  opts: { maxBytes?: number } = {}
): Promise<Buffer> {
  const { accessToken: token } = await getWhatsAppPlatformConfig()
  if (!token) throw new Error('[WhatsApp] Missing platform config: access token not set')

  // Step 1: resolve download URL (+ size/mime metadata)
  const urlRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!urlRes.ok) {
    throw new Error(`[WhatsApp] media URL lookup failed ${urlRes.status}`)
  }
  const meta = (await urlRes.json()) as { url: string; file_size?: number | string; mime_type?: string }
  const url = meta.url

  const kind = mediaKindFromMime(meta.mime_type)
  const declared = Number(meta.file_size)
  if (Number.isFinite(declared) && declared > 0) {
    if (typeof opts.maxBytes === 'number') {
      if (declared > opts.maxBytes) throw new MediaTooLargeError(kind ?? 'image', declared)
    } else if (kind && isOverMediaLimit(kind, declared)) {
      throw new MediaTooLargeError(kind, declared)
    }
  }

  // Step 2: download binary — Authorization header required by Meta
  const mediaRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!mediaRes.ok) {
    throw new Error(`[WhatsApp] media download failed ${mediaRes.status}`)
  }
  return Buffer.from(await mediaRes.arrayBuffer())
}
