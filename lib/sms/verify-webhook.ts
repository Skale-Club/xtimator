import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verifies the X-Twilio-Signature header sent by Twilio on inbound webhooks
 * (e.g. SMS status callbacks, inbound message webhooks).
 *
 * Twilio's algorithm (HIGH confidence, per 176-RESEARCH.md — NOT the same
 * construction as lib/whatsapp/verify.ts's Meta HMAC-SHA256-over-raw-body):
 *   1. Take the full webhook URL (byte-exact match to what Twilio POSTed to).
 *   2. Take every POST parameter (form-decoded key/value pairs).
 *   3. Sort parameter names alphabetically by key.
 *   4. Append `key + value` for each pair, in sorted order, directly onto the
 *      URL string — no delimiters anywhere.
 *   5. HMAC-SHA1 the resulting string, keyed with the Twilio Auth Token.
 *   6. Base64-encode the digest and timing-safe compare against the header.
 *
 * This function does not resolve the request URL itself — the caller (route
 * handler) is responsible for constructing the byte-exact URL Twilio signed.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string,
): boolean {
  if (!signature) return false

  const signingString =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join('')

  const expected = createHmac('sha1', authToken).update(signingString).digest('base64')

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    // timingSafeEqual throws if buffers have different lengths (e.g.
    // malformed/non-base64 signature) — treat as verification failure.
    return false
  }
}
