// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), issue: vi.fn(), revoke: vi.fn(), user: vi.fn(), set: vi.fn(), get: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.get, set: mocks.set }) }))
vi.mock('@/lib/auth/owned-session', async original => ({ ...await original<typeof import('@/lib/auth/owned-session')>(), readOwnedSession: mocks.read, issueDataToken: mocks.issue, revokeOwnedSession: mocks.revoke, toUser: mocks.user }))
import { GET, DELETE } from '@/app/api/auth/session/route'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_AUTH_MODE', 'owned')
  vi.stubEnv('APP_ORIGIN', 'https://xtimator.test')
  mocks.get.mockReturnValue({ value: 'opaque-session' })
  mocks.revoke.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())
const request = (origin = 'https://xtimator.test') => new Request('https://xtimator.test/api/auth/session', { method: 'DELETE', headers: { origin } })

describe('owned session HTTP boundary', () => {
  it('returns an anonymous snapshot only when the session store confirms it', async () => {
    mocks.read.mockResolvedValue(null)
    const response = await GET()
    expect(await response.json()).toEqual({ user: null, accessToken: null })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(mocks.issue).not.toHaveBeenCalled()
  })
  it('does not turn a store outage into a successful signed-out snapshot', async () => {
    mocks.read.mockRejectedValue(new Error('Store unavailable'))
    const response = await GET()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ code: 'auth_unavailable' })
  })
  it('rejects cross-origin logout without revoking or clearing cookies', async () => {
    expect((await DELETE(request('https://evil.test'))).status).toBe(403)
    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(mocks.set).not.toHaveBeenCalled()
  })
  it('revokes first, then clears every auth and support cookie', async () => {
    expect((await DELETE(request())).status).toBe(200)
    expect(mocks.revoke).toHaveBeenCalledWith('opaque-session')
    for (const name of ['xtimator_session', 'xtimator_pending_identity', 'xtimator_account_recovery', 'xtimator_email_confirmation', 'support_mode_session']) {
      expect(mocks.set).toHaveBeenCalledWith(name, '', expect.objectContaining({ httpOnly: true, maxAge: 0 }))
    }
    expect(mocks.revoke.mock.invocationCallOrder[0]).toBeLessThan(mocks.set.mock.invocationCallOrder[0])
  })
  it('does not report successful logout when revocation fails', async () => {
    mocks.revoke.mockRejectedValue(new Error('Store unavailable'))
    expect((await DELETE(request())).status).toBe(503)
    expect(mocks.set).not.toHaveBeenCalled()
  })
})
