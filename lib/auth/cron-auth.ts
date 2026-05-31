import { timingSafeEqual } from 'node:crypto'

/**
 * Security Review S13 — constant-time cron authorization.
 *
 * Vercel cron routes authenticate with a shared `CRON_SECRET` Bearer token.
 * A naive `auth !== \`Bearer ${secret}\`` comparison short-circuits on the
 * first differing byte, leaking the secret byte-by-byte via response timing.
 * `timingSafeEqual` compares in constant time; we also length-guard (it throws
 * on length mismatch) so a wrong-length header is rejected cleanly.
 *
 * Returns true only when the Authorization header exactly matches the expected
 * Bearer token. Returns false when the secret is unset or the header is absent.
 */
export function isAuthorizedCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false

  const provided = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${cronSecret}`

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
