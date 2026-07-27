import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const originalEnv = {
  demoOrigin: process.env.DEMO_APP_ORIGIN,
  demoEmail: process.env.DEMO_USER_EMAIL,
  demoPassword: process.env.DEMO_USER_PASSWORD,
}

type SupabaseScenario = {
  claims?: { sub: string; email?: string } | null
  membership?: { company_id: string } | null
  platformAdmin?: { user_id: string } | null
  generateLink?: { error: unknown }
  signIn?: { user: { id: string; email?: string } | null; error: unknown }
}

async function loadSession(scenario: SupabaseScenario) {
  vi.resetModules()
  process.env.DEMO_APP_ORIGIN = 'https://demo.xtimator.com'
  process.env.DEMO_USER_EMAIL = 'demo@example.com'
  process.env.DEMO_USER_PASSWORD = 'server-only-password'

  const signOut = vi.fn().mockResolvedValue({ error: null })
  // Admin API (service role) — mints a one-time magic-link token server-side.
  // No CAPTCHA gate applies here (unlike signInWithPassword).
  const generateLink = vi.fn().mockResolvedValue(
    scenario.generateLink?.error
      ? { data: null, error: scenario.generateLink.error }
      : { data: { properties: { hashed_token: 'fake-hashed-token' } }, error: null }
  )
  const requireServiceClient = vi.fn(() => ({ auth: { admin: { generateLink } } }))
  // The request-scoped client redeems the token_hash and writes real session cookies.
  const verifyOtp = vi.fn().mockResolvedValue(
    {
      data: scenario.signIn ?? { user: { id: 'demo-user-id', email: 'demo@example.com' }, error: null },
      error: scenario.signIn?.error ?? null,
    }
  )
  const getClaims = vi.fn().mockResolvedValue({ data: { claims: scenario.claims ?? null } })
  const maybeSingle = vi.fn()
    .mockResolvedValueOnce({ data: scenario.membership ?? { company_id: '0000de00-0000-0000-0000-000000000001' } })
    .mockResolvedValueOnce({ data: scenario.platformAdmin ?? null })
    .mockResolvedValueOnce({ data: scenario.membership ?? { company_id: '0000de00-0000-0000-0000-000000000001' } })
    .mockResolvedValueOnce({ data: scenario.platformAdmin ?? null })
  const from = vi.fn().mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
        maybeSingle,
      }),
    }),
  }))
  const createServerClient = vi.fn(() => ({
    auth: { getClaims, signOut, verifyOtp },
    from,
  }))

  vi.doMock('@supabase/ssr', () => ({ createServerClient }))
  vi.doMock('@/lib/supabase/service', () => ({ requireServiceClient }))
  const session = await import('@/lib/demo/session')
  return { ...session, createServerClient, from, getClaims, generateLink, verifyOtp, signOut }
}

afterEach(() => {
  vi.resetModules()
  process.env.DEMO_APP_ORIGIN = originalEnv.demoOrigin
  process.env.DEMO_USER_EMAIL = originalEnv.demoEmail
  process.env.DEMO_USER_PASSWORD = originalEnv.demoPassword
})

describe('ENTRY-02 and ENTRY-03: establishDemoSession', () => {
  it('reuses only the verified dedicated principal and writes a host-only active company cookie', async () => {
    const session = await loadSession({ claims: { sub: 'demo-user-id', email: 'demo@example.com' } })
    const response = await session.establishDemoSession(
      new NextRequest('https://demo.xtimator.com/demo/entry')
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://demo.xtimator.com/dashboard')
    expect(session.generateLink).not.toHaveBeenCalled()
    expect(session.verifyOtp).not.toHaveBeenCalled()
    expect(session.signOut).not.toHaveBeenCalled()
    expect(response.headers.get('set-cookie')).toContain('active_company_id=0000de00-0000-0000-0000-000000000001')
    expect(response.headers.get('set-cookie')).toContain('Secure')
    expect(response.headers.get('set-cookie')).not.toMatch(/Domain=/i)
  })

  it('repairs wrong, stale, or partial state once with a local sign-out and observed-cookie expiry', async () => {
    const session = await loadSession({ claims: { sub: 'wrong-user-id', email: 'wrong@example.com' } })
    const response = await session.establishDemoSession(
      new NextRequest('https://demo.xtimator.com/demo/entry', {
        headers: { cookie: 'sb-demo-auth-token.0=stale; active_company_id=wrong-company' },
      })
    )

    expect(response.status).toBe(303)
    expect(session.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(session.generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'demo@example.com',
    })
    expect(session.verifyOtp).toHaveBeenCalledWith({
      type: 'magiclink',
      token_hash: 'fake-hashed-token',
    })
    expect(response.headers.getSetCookie().join('\n')).toMatch(/sb-demo-auth-token\.0=.*Max-Age=0/i)
    // NextResponse coalesces a cleared cookie with the deterministic final
    // value; the repaired response must therefore end with the demo company.
    expect(response.headers.getSetCookie().join('\n')).toContain(
      'active_company_id=0000de00-0000-0000-0000-000000000001'
    )
  })

  it('fails closed without a dashboard redirect when the configured identity has platform authority', async () => {
    const session = await loadSession({
      claims: { sub: 'demo-user-id', email: 'demo@example.com' },
      platformAdmin: { user_id: 'demo-user-id' },
    })
    const response = await session.establishDemoSession(
      new NextRequest('https://demo.xtimator.com/demo/entry')
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('set-cookie') ?? '').not.toContain('active_company_id=')
  })

  it('returns a terminal generic 503 after one failed repair instead of redirecting in a loop', async () => {
    const session = await loadSession({
      claims: null,
      signIn: { user: null, error: new Error('bad credentials') },
    })
    const response = await session.establishDemoSession(
      new NextRequest('https://demo.xtimator.com/demo/entry?next=https://evil.example')
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('location')).toBeNull()
    await expect(response.text()).resolves.not.toContain('bad credentials')
  })
})
