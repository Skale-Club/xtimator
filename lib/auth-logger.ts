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

export function logAuthEvent(payload: AuthEventPayload): void {
  // Server-side only guard — never log to browser
  if (typeof window !== 'undefined') return

  console.log(
    JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
      service: 'auth',
    })
  )
}
