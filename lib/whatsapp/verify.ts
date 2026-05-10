import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verifies the X-Hub-Signature-256 header sent by Meta Cloud API.
 * Uses HMAC-SHA256 with the app secret.
 * Uses timingSafeEqual to prevent timing attacks.
 *
 * IMPORTANT: rawBody must be the raw string BEFORE JSON.parse — never pass
 * the re-serialized payload (JSON.stringify changes whitespace/key order).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const received = signature.slice('sha256='.length)
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  } catch {
    // timingSafeEqual throws if buffers have different lengths
    return false
  }
}
