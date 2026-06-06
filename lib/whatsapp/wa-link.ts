/**
 * Build a WhatsApp click-to-chat (wa.me) deep link.
 *
 * wa.me requires the destination number as digits only (no +, spaces, or dashes).
 * The optional prefilled text is URL-encoded into the `text` query param.
 *
 * Returns null when the number has no usable digits, so callers can omit the CTA.
 */
export function buildWaMeLink(displayNumber: string | null | undefined, prefilledText?: string): string | null {
  if (!displayNumber) return null
  const digits = displayNumber.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return null
  const base = `https://wa.me/${digits}`
  if (!prefilledText) return base
  return `${base}?text=${encodeURIComponent(prefilledText)}`
}
