import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * SEAT-04 — the `next` redirect branch in lib/actions/auth.ts.
 *
 * Proves the routing that SKIPS the create-company onboarding for an invited
 * signup: when signUp/signIn carry a safe `next=/invite/accept?token=...`, the
 * action redirects there (JOIN) instead of /onboarding (CREATE) or /dashboard.
 * A hostile `next` (absolute URL) is rejected by the open-redirect guard, so the
 * normal destination is preserved — retrocompat for non-invited signups intact.
 *
 * Boundaries mocked: '@/lib/supabase/server' (auth.signUp / signInWithPassword /
 * getClaims + the companies select), 'next/navigation' redirect (captured + made
 * to throw like the real one so the action halts), '@/lib/auth-logger', and
 * '@/lib/utils/site-url'. The target module is imported late per the team-invite
 * test idiom so each test sees its configured mocks.
 */

// ─── next/navigation redirect: capture path, throw to halt like the real one ──
const redirectError = (path: string) =>
  Object.assign(new Error(`NEXT_REDIRECT:${path}`), { __isRedirect: true, path })

const redirect = vi.fn((path: string) => {
  throw redirectError(path)
})
vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
}))

// ─── auth-logger / site-url: inert ───────────────────────────────────────────
vi.mock('@/lib/auth-logger', () => ({ logAuthEvent: vi.fn() }))
vi.mock('@/lib/utils/site-url', () => ({ getCanonicalBaseUrl: () => 'https://app.test' }))

// ─── supabase server client ──────────────────────────────────────────────────
const signUpResult = { error: null as { message: string } | null }
const signInResult = { error: null as { message: string } | null }
const claimsResult = { data: { claims: { sub: 'u1' } } as { claims: Record<string, unknown> | null } }
const companyResult = { data: null as { id: string } | null }

const authSignUp = vi.fn()
const authSignInWithPassword = vi.fn()
const authGetClaims = vi.fn()
const companiesSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signUp: (...a: unknown[]) => authSignUp(...a),
      signInWithPassword: (...a: unknown[]) => authSignInWithPassword(...a),
      getClaims: () => authGetClaims(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => companiesSingle(),
        }),
      }),
    }),
  }),
}))

function buildFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  signUpResult.error = null
  signInResult.error = null
  claimsResult.data = { claims: { sub: 'u1' } }
  companyResult.data = null
  authSignUp.mockImplementation(async () => signUpResult)
  authSignInWithPassword.mockImplementation(async () => signInResult)
  authGetClaims.mockImplementation(async () => claimsResult)
  companiesSingle.mockImplementation(async () => companyResult)
})

describe('SEAT-04: signUp honors a safe invite `next`', () => {
  it('redirects to /invite/accept?token=... when next is the accept path (invited signup → JOIN, never /onboarding)', async () => {
    const { signUp } = await import('@/lib/actions/auth')

    await expect(
      signUp(buildFormData({ email: 'a@b.co', password: 'pw', next: '/invite/accept?token=abc' }))
    ).rejects.toThrow('NEXT_REDIRECT:/invite/accept?token=abc')

    expect(redirect).toHaveBeenCalledWith('/invite/accept?token=abc')
    expect(redirect).not.toHaveBeenCalledWith('/onboarding')
  })

  it('redirects to /onboarding when no next is present (non-invited signup unchanged)', async () => {
    const { signUp } = await import('@/lib/actions/auth')

    await expect(
      signUp(buildFormData({ email: 'a@b.co', password: 'pw' }))
    ).rejects.toThrow('NEXT_REDIRECT:/onboarding')

    expect(redirect).toHaveBeenCalledWith('/onboarding')
  })

  it('rejects a hostile absolute next and falls through to /onboarding (open-redirect guard)', async () => {
    const { signUp } = await import('@/lib/actions/auth')

    await expect(
      signUp(buildFormData({ email: 'a@b.co', password: 'pw', next: 'https://evil.com' }))
    ).rejects.toThrow('NEXT_REDIRECT:/onboarding')

    expect(redirect).toHaveBeenCalledWith('/onboarding')
    expect(redirect).not.toHaveBeenCalledWith('https://evil.com')
  })
})

describe('SEAT-04: signIn honors a safe invite `next`', () => {
  it('redirects an existing user to /invite/accept?token=... instead of /dashboard or /onboarding', async () => {
    companyResult.data = { id: 'c1' } // user already owns a company
    const { signIn } = await import('@/lib/actions/auth')

    await expect(
      signIn(buildFormData({ email: 'a@b.co', password: 'pw', next: '/invite/accept?token=abc' }))
    ).rejects.toThrow('NEXT_REDIRECT:/invite/accept?token=abc')

    expect(redirect).toHaveBeenCalledWith('/invite/accept?token=abc')
    expect(redirect).not.toHaveBeenCalledWith('/dashboard')
    expect(redirect).not.toHaveBeenCalledWith('/onboarding')
  })

  it('rejects a hostile next on signIn and uses the normal destination', async () => {
    companyResult.data = { id: 'c1' }
    const { signIn } = await import('@/lib/actions/auth')

    await expect(
      signIn(buildFormData({ email: 'a@b.co', password: 'pw', next: 'https://evil.com' }))
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard')

    expect(redirect).toHaveBeenCalledWith('/dashboard')
    expect(redirect).not.toHaveBeenCalledWith('https://evil.com')
  })
})
