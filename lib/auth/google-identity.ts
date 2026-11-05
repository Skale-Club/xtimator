import 'server-only'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))
export interface VerifiedIdentity {
  project: string
  subject: string
  provider: 'phone' | 'google.com'
  phone?: string
  email?: string
  googleSubject?: string
  name?: string
  authTime: number
}

export function publicIdentityConfig() {
  const projectId = process.env.GOOGLE_AUTH_PROJECT_ID
  const apiKey = process.env.FIREBASE_API_KEY
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN
  if (!projectId || !apiKey || !authDomain) throw new Error('Google identity configuration is incomplete')
  return { projectId, apiKey, authDomain }
}

/** Only accepts cryptographically verified claims from verifyIdentity below. */
export function identityFromClaims(claims: JWTPayload, project: string, now = Date.now()): VerifiedIdentity {
  const firebase = claims.firebase as { sign_in_provider?: string; tenant?: unknown; identities?: Record<string, unknown> } | undefined
  const provider = firebase?.sign_in_provider
  const authTime = claims.auth_time
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 || firebase?.tenant || !['phone', 'google.com'].includes(provider ?? '') ||
      typeof authTime !== 'number' || !Number.isSafeInteger(authTime) || authTime > now / 1000 + 30 || now / 1000 - authTime > 300) {
    throw new Error('Recent phone or Google authentication is required')
  }
  const phone = typeof claims.phone_number === 'string' && /^\+[1-9]\d{7,14}$/.test(claims.phone_number) ? claims.phone_number : undefined
  if (provider === 'phone' && !phone) throw new Error('Verified phone is required')
  const email = claims.email_verified === true && typeof claims.email === 'string' && claims.email.length <= 254 ? claims.email.toLowerCase() : undefined
  const googleIds = firebase?.identities?.['google.com']
  const googleSubject = provider === 'google.com' && Array.isArray(googleIds) && googleIds.length === 1 && typeof googleIds[0] === 'string' ? googleIds[0] : undefined
  return { project, subject: claims.sub, provider: provider as VerifiedIdentity['provider'], phone, email, googleSubject,
    name: typeof claims.name === 'string' ? claims.name.slice(0, 120) : undefined, authTime }
}

export async function verifyIdentity(token: string): Promise<VerifiedIdentity> {
  const { projectId } = publicIdentityConfig()
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ['RS256'], audience: projectId, issuer: `https://securetoken.google.com/${projectId}`,
    requiredClaims: ['sub', 'iat', 'exp', 'auth_time'], maxTokenAge: '5m',
  })
  return identityFromClaims(payload, projectId)
}
