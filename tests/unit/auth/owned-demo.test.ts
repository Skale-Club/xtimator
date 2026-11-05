// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ read: vi.fn(), issue: vi.fn(), revoke: vi.fn(), activation: vi.fn(), adminError: false, admin: null as unknown }))
vi.mock('@/lib/demo/config', () => ({ getDemoCompanyId: () => 'demo-company' }))
vi.mock('@/lib/queries/active-company', () => ({ ACTIVE_COMPANY_COOKIE: 'active_company_id', ACTIVE_COMPANY_COOKIE_OPTIONS: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 2592000 } }))
vi.mock('@/lib/auth/owned-session', async original => ({ ...await original<typeof import('@/lib/auth/owned-session')>(), readOwnedSession: m.read, issueOwnedSession: m.issue, revokeOwnedSession: m.revoke }))
vi.mock('@/lib/auth/owned-store', () => ({ requireOwnedActivation: m.activation }))
vi.mock('@/lib/supabase/data-service', () => ({ requireDataServiceClient: () => ({ from: (table: string) => {
  const chain: Record<string, unknown> = {}
  for (const name of ['select', 'eq']) chain[name] = () => chain
  const result = async () => ({ data: table === 'demo_config' ? { user_id: 'demo-user' }
    : table === 'xtimator_accounts' ? { id: 'demo-user', email: 'demo@example.test', disabled_at: null }
    : table === 'platform_admins' ? m.admin : { id: 'demo-company', user_id: 'demo-user' },
    error: table === 'platform_admins' && m.adminError ? { message: 'DB unavailable' } : null })
  chain.single = result; chain.maybeSingle = result
  return chain
} }) }))
import { establishOwnedDemoSession } from '@/lib/demo/owned-session'

beforeEach(() => {
  vi.clearAllMocks(); m.admin = null; m.adminError = false
  m.read.mockResolvedValue(null); m.issue.mockResolvedValue('opaque-demo-token'); m.revoke.mockResolvedValue(undefined); m.activation.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())
const origin = new URL('https://demo.xtimator.com')

describe('owned public demo session', () => {
  it('creates only a host-only cookie for the configured demo account/company', async () => {
    const response = await establishOwnedDemoSession(new NextRequest(new URL('/demo/entry', origin)), origin, 'demo@example.test')
    expect(response.status).toBe(303)
    expect(response.cookies.get('xtimator_session')).toMatchObject({ value: 'opaque-demo-token', httpOnly: true, secure: true, sameSite: 'lax' })
    expect(response.cookies.get('xtimator_session')?.domain).toBeUndefined()
    expect(response.cookies.get('active_company_id')?.value).toBe('demo-company')
    expect(m.issue).toHaveBeenCalledWith('demo-user')
  })
  it('fails closed when the platform-admin lookup fails', async () => {
    m.adminError = true
    expect((await establishOwnedDemoSession(new NextRequest(new URL('/demo/entry', origin)), origin, 'demo@example.test')).status).toBe(503)
    expect(m.issue).not.toHaveBeenCalled()
  })
  it('never grants a public demo session to an administrative principal', async () => {
    m.admin = { user_id: 'demo-user' }
    expect((await establishOwnedDemoSession(new NextRequest(new URL('/demo/entry', origin)), origin, 'demo@example.test')).status).toBe(503)
    expect(m.issue).not.toHaveBeenCalled()
  })
})
