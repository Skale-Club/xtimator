// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ rate: vi.fn(), activation: vi.fn(), read: vi.fn(), key: vi.fn(), send: vi.fn(), rpc: vi.fn(), cookie: vi.fn(), set: vi.fn(), writes: [] as unknown[], accounts: [] as { id: string }[], demo: null as unknown }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: m.cookie, set: m.set }) }))
vi.mock('@/lib/auth/owned-store', () => ({ requireOwnedActivation: m.activation, rateLimitOwned: m.rate }))
vi.mock('@/lib/auth/owned-session', async original => ({ ...await original<typeof import('@/lib/auth/owned-session')>(), readOwnedSession: m.read }))
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey: m.key }))
vi.mock('resend', () => ({ Resend: class { emails = { send: m.send } } }))
vi.mock('@/lib/supabase/data-service', () => ({ requireDataServiceClient: () => ({
  rpc: m.rpc,
  from: (table: string) => {
    let mutation = false
    const chain: Record<string, unknown> = {}
    for (const name of ['select', 'eq', 'ilike', 'not', 'is', 'limit', 'delete']) chain[name] = () => chain
    chain.insert = (value: unknown) => { mutation = true; m.writes.push(value); return chain }
    const value = () => ({ data: mutation ? null : table === 'xtimator_accounts' ? m.accounts : m.demo, error: null })
    chain.maybeSingle = async () => value()
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(value()))
    return chain
  },
}) }))
import { POST } from '@/app/api/auth/recovery/route'

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('NEXT_PUBLIC_AUTH_MODE', 'owned'); vi.stubEnv('APP_ORIGIN', 'https://xtimator.test')
  m.writes = []; m.accounts = [{ id: 'legacy-account' }]; m.demo = null
  m.rate.mockResolvedValue(true); m.activation.mockResolvedValue(undefined); m.read.mockResolvedValue(null)
  m.key.mockResolvedValue('fake-email-key'); m.send.mockResolvedValue({ data: { id: 'test-delivery' }, error: null })
  m.rpc.mockResolvedValue({ data: false, error: null }); m.cookie.mockReturnValue({ value: 'x'.repeat(43) })
})
afterEach(() => vi.unstubAllEnvs())
const request = (body: object, origin = 'https://xtimator.test') => new Request('https://xtimator.test/api/auth/recovery', { method: 'POST', headers: { origin }, body: JSON.stringify(body) })

describe('owned account recovery', () => {
  it('returns the same public response for known and unknown account addresses', async () => {
    const known = await POST(request({ action: 'send', email: 'known@example.test' }))
    expect(await known.json()).toEqual({ status: 'code_sent' }); expect(m.send).toHaveBeenCalledOnce()
    const stored = m.writes[0] as { code_hash: string; token_hash: string }
    expect(stored.code_hash).toMatch(/^[a-f0-9]{64}$/); expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/)
    m.send.mockClear(); m.accounts = []
    const unknown = await POST(request({ action: 'send', email: 'unknown@example.test' }))
    expect(await unknown.json()).toEqual({ status: 'code_sent' }); expect(m.send).not.toHaveBeenCalled()
    expect(m.set).toHaveBeenLastCalledWith('xtimator_account_recovery', expect.any(String), expect.objectContaining({ httpOnly: true, maxAge: 600 }))
  })
  it('rejects wrong codes and delegates bounded attempt accounting to the transaction', async () => {
    const response = await POST(request({ action: 'verify', code: '123456' }))
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ code: 'wrong_code' })
    expect(m.rpc).toHaveBeenCalledWith('xtimator_verify_challenge', expect.objectContaining({ p_token: expect.stringMatching(/^[a-f0-9]{64}$/), p_code: expect.stringMatching(/^[a-f0-9]{64}$/) }))
  })
  it('never sends a recovery email or stores a challenge after cross-origin or rate denial', async () => {
    expect((await POST(request({ action: 'send', email: 'user@example.test' }, 'https://evil.test'))).status).toBe(403)
    m.rate.mockResolvedValue(false)
    expect((await POST(request({ action: 'send', email: 'user@example.test' }))).status).toBe(429)
    expect(m.writes).toHaveLength(0); expect(m.send).not.toHaveBeenCalled()
  })
  it('requires recent account authentication to change a verified email', async () => {
    m.read.mockResolvedValue({ user_id: 'legacy-account', auth_time: new Date(Date.now() - 600_000).toISOString() })
    expect((await POST(request({ action: 'send', purpose: 'email', email: 'new@example.test' }))).status).toBe(401)
    expect(m.writes).toHaveLength(0); expect(m.send).not.toHaveBeenCalled()
  })
  it('blocks public demo email changes before writes or delivery', async () => {
    m.read.mockResolvedValue({ user_id: 'demo', auth_time: new Date().toISOString() }); m.demo = { user_id: 'demo' }
    expect((await POST(request({ action: 'send', purpose: 'email', email: 'new@example.test' }))).status).toBe(403)
    expect(m.writes).toHaveLength(0); expect(m.send).not.toHaveBeenCalled()
  })
})
