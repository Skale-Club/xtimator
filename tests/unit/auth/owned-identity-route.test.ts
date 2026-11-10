// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Phase 3a: WhatsApp auto-link is best-effort and tested in whatsapp/sender-link.test.ts.
vi.mock('@/lib/whatsapp/sender-link', () => ({
  ensureWhatsAppSenderForUser: vi.fn().mockResolvedValue({ status: 'linked' }),
  syncWhatsAppSenderAfterPhoneChange: vi.fn().mockResolvedValue(undefined),
  findOwnerCandidateByVerifiedPhone: vi.fn().mockResolvedValue(null),
}))

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), complete: vi.fn(), account: vi.fn(), rate: vi.fn(), remember: vi.fn(), activation: vi.fn(),
  read: vi.fn(), issue: vi.fn(), revoke: vi.fn(), setCookie: vi.fn(), cookieValues: new Map<string, string>(),
  rows: {} as Record<string, unknown>, from: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => mocks.cookieValues.has(name) ? { value: mocks.cookieValues.get(name) } : undefined, set: mocks.setCookie }) }))
vi.mock('@/lib/auth/google-identity', () => ({ verifyIdentity: mocks.verify }))
vi.mock('@/lib/auth/owned-store', () => ({ completeIdentity: mocks.complete, getOwnedAccount: mocks.account, rateLimitOwned: mocks.rate, rememberGoogle: mocks.remember, requireOwnedActivation: mocks.activation }))
vi.mock('@/lib/auth/owned-session', async original => ({ ...await original<typeof import('@/lib/auth/owned-session')>(), readOwnedSession: mocks.read, issueOwnedSession: mocks.issue, revokeOwnedSession: mocks.revoke }))
vi.mock('@/lib/supabase/data-service', () => ({ requireDataServiceClient: () => ({ from: mocks.from }) }))
import { POST } from '@/app/api/auth/identity/route'

beforeEach(() => {
  vi.clearAllMocks(); mocks.cookieValues.clear()
  vi.stubEnv('NEXT_PUBLIC_AUTH_MODE', 'owned'); vi.stubEnv('APP_ORIGIN', 'https://xtimator.test')
  mocks.verify.mockResolvedValue({ project: 'test', subject: 'verified-phone', provider: 'phone', phone: '+15085550100', authTime: Math.floor(Date.now() / 1000) })
  mocks.complete.mockResolvedValue('existing-account')
  mocks.account.mockResolvedValue({ id: 'existing-account', phone_confirmed_at: new Date().toISOString(), email: null })
  mocks.rate.mockResolvedValue(true); mocks.remember.mockResolvedValue('pending-google'); mocks.activation.mockResolvedValue(undefined)
  mocks.read.mockResolvedValue(null); mocks.issue.mockResolvedValue('new-session-token'); mocks.revoke.mockResolvedValue(undefined)
  mocks.rows = { demo_config: null, companies: null, company_members: { company_id: 'member-company' }, company_invites: null }
  mocks.from.mockImplementation((table: string) => {
    const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() }
    for (const fn of ['select', 'eq', 'order', 'limit'] as const) chain[fn].mockReturnValue(chain)
    chain.maybeSingle.mockResolvedValue({ data: mocks.rows[table], error: null })
    return chain
  })
})
afterEach(() => vi.unstubAllEnvs())
function request(body: object, origin = 'https://xtimator.test') {
  return new Request('https://xtimator.test/api/auth/identity', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

describe('owned login endpoint', () => {
  it('rejects cross-origin before verifying a token or issuing a session', async () => {
    expect((await POST(request({ idToken: 'test' }, 'https://evil.test'))).status).toBe(403)
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.issue).not.toHaveBeenCalled()
  })
  it('never allows client account IDs or roles into the identity contract', async () => {
    expect((await POST(request({ idToken: 'test', userId: 'admin', role: 'owner' }))).status).toBe(400)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('rejects invalid provider proof before provisioning', async () => {
    mocks.verify.mockRejectedValue(new Error('Invalid signature'))
    expect((await POST(request({ idToken: 'test' }))).status).toBe(401)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('retains a member account and issues only a host-scoped HttpOnly session cookie', async () => {
    const response = await POST(request({ idToken: 'test' }))
    expect(await response.json()).toEqual({ status: 'active', redirectTo: '/dashboard' })
    expect(mocks.setCookie).toHaveBeenCalledWith('xtimator_session', 'new-session-token', expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 2592000 }))
    expect(mocks.issue).toHaveBeenCalledWith('existing-account', expect.any(Number))
    expect(mocks.complete.mock.calls[0][1].currentUser).toBeUndefined()
  })
  it('remembers unknown Google proof and asks for phone without authenticating the app', async () => {
    mocks.verify.mockResolvedValue({ project: 'test', subject: 'unknown-google', provider: 'google.com' })
    mocks.complete.mockResolvedValue(null)
    expect(await (await POST(request({ idToken: 'test' }))).json()).toEqual({ status: 'phone_required' })
    expect(mocks.setCookie).toHaveBeenCalledWith('xtimator_pending_identity', 'pending-google', expect.objectContaining({ httpOnly: true, maxAge: 600 }))
    expect(mocks.issue).not.toHaveBeenCalled()
  })
  it('requires fresh ownership proof for a login-phone replacement', async () => {
    mocks.read.mockResolvedValue({ user_id: 'current', auth_time: new Date(Date.now() - 600_000).toISOString() })
    expect(await (await POST(request({ idToken: 'test', purpose: 'link' }))).json()).toEqual({ code: 'reauthentication_required' })
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('verifies invitation email before returning to accept, without creating a company', async () => {
    mocks.rows.company_invites = { email: 'invited@example.test', status: 'pending', expires_at: new Date(Date.now() + 86400_000).toISOString() }
    const response = await POST(request({ idToken: 'test', next: '/invite/accept?token=secret-invite' }))
    expect(await response.json()).toEqual({ status: 'email_required', redirectTo: '/invite/accept?token=secret-invite' })
    expect(mocks.issue).toHaveBeenCalledOnce()
    expect(mocks.from.mock.calls.map(([table]) => table)).toContain('company_invites')
  })
  it('revokes other account sessions after recovery', async () => {
    mocks.cookieValues.set('xtimator_account_recovery', 'verified-recovery')
    await POST(request({ idToken: 'test' }))
    expect(mocks.complete.mock.calls[0][1].recovery).toBe('verified-recovery')
    expect(mocks.revoke).toHaveBeenCalledWith('new-session-token', 'existing-account')
  })
  it('cannot bind a real phone to the public demo principal', async () => {
    mocks.read.mockResolvedValue({ user_id: 'demo', auth_time: new Date().toISOString() })
    mocks.rows.demo_config = { user_id: 'demo' }
    expect((await POST(request({ idToken: 'test', purpose: 'link' }))).status).toBe(403)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
})
