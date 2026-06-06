/**
 * Thin typed wrapper around Meta Graph API v21.0.
 * All calls are server-side only — never import from client components.
 */

import { getWhatsAppPlatformConfig } from '@/lib/platform-config'

const GRAPH_BASE = `https://graph.facebook.com/${process.env.META_WHATSAPP_API_VERSION ?? 'v21.0'}`

/**
 * Send a WhatsApp message to a recipient phone number (E.164).
 * body should be a partial Messages API object (type + content fields).
 */
export async function sendWhatsAppMessage(to: string, body: object): Promise<void> {
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
}

/**
 * Mark an inbound message as read (blue checks appear on user's phone).
 * Fire-and-forget — failures are swallowed and logged. Never blocks processing.
 *
 * Meta docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/mark-message-as-read
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
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
 * Two-step: (1) resolve media URL via mediaId, (2) download binary.
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<Buffer> {
  const { accessToken: token } = await getWhatsAppPlatformConfig()
  if (!token) throw new Error('[WhatsApp] Missing platform config: access token not set')

  // Step 1: resolve download URL
  const urlRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!urlRes.ok) {
    throw new Error(`[WhatsApp] media URL lookup failed ${urlRes.status}`)
  }
  const { url } = (await urlRes.json()) as { url: string }

  // Step 2: download binary — Authorization header required by Meta
  const mediaRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!mediaRes.ok) {
    throw new Error(`[WhatsApp] media download failed ${mediaRes.status}`)
  }
  return Buffer.from(await mediaRes.arrayBuffer())
}
