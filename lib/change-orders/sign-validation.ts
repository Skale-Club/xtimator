// lib/change-orders/sign-validation.ts
//
// Input validators for the public change-order sign route. They are a careful
// COPY of the ones in app/api/estimates/[id]/sign/route.ts (module-local there;
// the estimate route is deliberately left untouched). Keep the two in step.
//
// signatureData is later fed to react-pdf's <Image src>, which fetches it
// SERVER-SIDE during PDF rendering, so it must be a data: URI whose decoded
// bytes are a PNG (closes the SSRF vector) and small (bounds the row size).

const SIGNATURE_DATA_URL_PREFIX = 'data:image/png;base64,'
export const MAX_SIGNATURE_BYTES = 200 * 1024
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const BASE64_RE = /^[A-Za-z0-9+/]+=*$/

/** Returns an error message, or null when the signature image is acceptable. */
export function validateSignatureData(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(SIGNATURE_DATA_URL_PREFIX)) {
    return 'Signature must be a PNG image data URL'
  }
  const payload = value.slice(SIGNATURE_DATA_URL_PREFIX.length)
  if (payload.length === 0 || !BASE64_RE.test(payload)) {
    return 'Invalid signature data encoding'
  }
  const decoded = Buffer.from(payload, 'base64')
  if (decoded.length === 0) {
    return 'Invalid signature data encoding'
  }
  if (decoded.length > MAX_SIGNATURE_BYTES) {
    return 'Signature image is too large'
  }
  if (!decoded.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return 'Signature data is not a valid PNG image'
  }
  return null
}

const SIGNER_EMAIL_RE = /^\S+@\S+\.\S+$/

/** Returns the trimmed email (or null when absent/blank), or `undefined` to signal "invalid: 400". */
export function validateSignerEmail(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > 320 || !SIGNER_EMAIL_RE.test(trimmed)) return undefined
  return trimmed
}

/** True when both values are valid timestamps for the SAME instant (formats may differ). */
export function sameInstant(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb
}
