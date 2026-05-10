/**
 * Thin typed wrapper around Meta Graph API v21.0.
 * All calls are server-side only — never import from client components.
 */

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

/**
 * Send a WhatsApp message to a recipient phone number (E.164).
 * body should be a partial Messages API object (type + content fields).
 */
export async function sendWhatsAppMessage(to: string, body: object): Promise<void> {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID
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
 * Download a media file from WhatsApp Cloud API.
 * Two-step: (1) resolve media URL via mediaId, (2) download binary.
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<Buffer> {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN

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
