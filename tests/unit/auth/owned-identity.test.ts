// @vitest-environment node
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'

const state = vi.hoisted(() => ({ resolve: undefined as unknown }))
vi.mock('jose', async original => ({ ...await original<typeof import('jose')>(), createRemoteJWKSet: () => (...args: unknown[]) => (state.resolve as (...args: unknown[]) => unknown)(...args) }))
import { identityFromClaims, verifyIdentity } from '@/lib/auth/google-identity'
import { safeInviteDestination, sameAuthOrigin } from '@/lib/auth/http'

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
beforeAll(async () => {
  const pair = await generateKeyPair('RS256'); privateKey = pair.privateKey
  state.resolve = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test', alg: 'RS256' }] })
})
beforeEach(() => {
  vi.stubEnv('GOOGLE_AUTH_PROJECT_ID', 'xtimator-test')
  vi.stubEnv('FIREBASE_API_KEY', 'public-test')
  vi.stubEnv('FIREBASE_AUTH_DOMAIN', 'xtimator-test.firebaseapp.com')
  vi.stubEnv('APP_ORIGIN', 'https://xtimator.test')
})
afterEach(() => vi.unstubAllEnvs())

const now = () => Math.floor(Date.now() / 1000)
const claims = () => ({ sub: 'provider-subject', auth_time: now(), phone_number: '+15085550123', firebase: { sign_in_provider: 'phone' } })
async function token(options: { issuer?: string; audience?: string; expired?: boolean; authTime?: number } = {}) {
  return new SignJWT({ ...claims(), auth_time: options.authTime ?? now() }).setSubject('provider-subject')
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(options.issuer ?? 'https://securetoken.google.com/xtimator-test')
    .setAudience(options.audience ?? 'xtimator-test').setIssuedAt().setExpirationTime(options.expired ? '0s' : '1h').sign(privateKey)
}

describe('owned identity cryptographic boundary', () => {
  it('accepts an authenticated phone without adopting an application ID claim', async () => {
    expect(await verifyIdentity(await token())).toMatchObject({ project: 'xtimator-test', subject: 'provider-subject', phone: '+15085550123', provider: 'phone' })
    expect(identityFromClaims({ ...claims(), userId: 'admin' }, 'xtimator-test')).not.toHaveProperty('userId')
  })
  it('rejects wrong audience, issuer, expiration, signature and stale authentication', async () => {
    const valid = await token(); const parts = valid.split('.'); parts[2] = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1)
    for (const value of [await token({ audience: 'other' }), await token({ issuer: 'https://evil.test' }), await token({ expired: true }), await token({ authTime: now() - 600 }), parts.join('.')]) {
      await expect(verifyIdentity(value)).rejects.toThrow()
    }
  })
  it('requires supported provider, no foreign tenant, verified phone and recent auth_time', () => {
    for (const value of [
      { ...claims(), firebase: { sign_in_provider: 'password' } },
      { ...claims(), firebase: { sign_in_provider: 'phone', tenant: 'other' } },
      { ...claims(), phone_number: '' }, { ...claims(), auth_time: now() + 3600 }, { ...claims(), auth_time: '123' },
    ]) expect(() => identityFromClaims(value, 'xtimator-test')).toThrow()
  })
  it('adopts email and legacy Google subject only from verified Google claims', () => {
    const value = { ...claims(), email: 'OWNER@EXAMPLE.TEST', email_verified: false, firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['original-google-subject'] } } }
    expect(identityFromClaims(value, 'xtimator-test')).toMatchObject({ email: undefined, googleSubject: 'original-google-subject' })
    expect(identityFromClaims({ ...value, email_verified: true }, 'xtimator-test').email).toBe('owner@example.test')
  })
})

describe('auth HTTP boundaries', () => {
  it('permits only exact same-origin auth mutations', () => {
    expect(sameAuthOrigin(new Request('https://xtimator.test/api/auth/identity', { headers: { origin: 'https://xtimator.test' } }))).toBe(true)
    for (const origin of [undefined, 'null', 'https://evil.test', 'https://xtimator.test.evil.test']) {
      expect(sameAuthOrigin(new Request('https://xtimator.test/api/auth/identity', { headers: origin ? { origin } : {} }))).toBe(false)
    }
  })
  it('resumes only the precise invite path, never external or lookalike paths', () => {
    expect(safeInviteDestination('/invite/accept?token=test')).toBe('/invite/accept?token=test')
    for (const value of ['//evil.test', 'https://evil.test/invite/accept', '/invite/accept-evil', '/invite/accept/other', '/\\evil.test', '/dashboard']) expect(safeInviteDestination(value)).toBeNull()
  })
  it('allows configured-demo logout only on its own host, without allowing demo identity mutation', () => {
    vi.stubEnv('DEMO_APP_ORIGIN', 'https://demo.xtimator.com')
    const demo = new Request('https://demo.xtimator.com/api/auth/session', { headers: { origin: 'https://demo.xtimator.com' } })
    expect(sameAuthOrigin(demo)).toBe(false)
    expect(sameAuthOrigin(demo, true)).toBe(true)
    expect(sameAuthOrigin(new Request('https://xtimator.test/api/auth/session', { headers: { origin: 'https://demo.xtimator.com' } }), true)).toBe(false)
  })
})
