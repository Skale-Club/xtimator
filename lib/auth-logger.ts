import { createHash } from 'node:crypto'

type AuthEventName =
  | 'sign_in_attempt'
  | 'sign_up_attempt'
  | 'sign_out'
  | 'oauth_callback'
  | 'password_reset_request'
  | 'password_update'

interface AuthEventPayload {
  event: AuthEventName
  success: boolean
  userId?: string // Supabase auth.uid when available
  email?: string // Only log email on attempt/failure events
  provider?: string // OAuth provider (e.g. 'google')
  redirectTo?: string // OAuth callback redirect destination
  error?: string // Sanitized error message (never include raw Supabase error details that may leak schema info)
}

/**
 * Security Review S02/S12: don't write raw emails (PII) into stdout logs that
 * Vercel aggregates. Replace with a short, stable sha256 prefix — enough to
 * correlate events for the same account without storing the address itself.
 */
function redactEmail(email: string): string {
  return `sha256:${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12)}`
}

export function logAuthEvent(payload: AuthEventPayload): void {
  // Server-side only guard — never log to browser
  if (typeof window !== 'undefined') return

  const { email, ...rest } = payload
  console.log(
    JSON.stringify({
      ...rest,
      ...(email ? { emailHash: redactEmail(email) } : {}),
      timestamp: new Date().toISOString(),
      service: 'auth',
    })
  )
}
