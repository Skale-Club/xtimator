/**
 * Unit tests for lib/actions/auth.ts — RED phase (01-04 Task 1)
 *
 * These tests verify module shape (exports) since server actions
 * require a real Next.js runtime to invoke. Full flow covered in E2E.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('lib/actions/auth module exports', () => {
  it('exports signUp as a function', async () => {
    const mod = await import('@/lib/actions/auth')
    expect(typeof mod.signUp).toBe('function')
  })

  it('exports signIn as a function', async () => {
    const mod = await import('@/lib/actions/auth')
    expect(typeof mod.signIn).toBe('function')
  })

  it('exports signOut as a function', async () => {
    const mod = await import('@/lib/actions/auth')
    expect(typeof mod.signOut).toBe('function')
  })

  it('exports resetPassword as a function', async () => {
    const mod = await import('@/lib/actions/auth')
    expect(typeof mod.resetPassword).toBe('function')
  })

  it('exports updatePassword as a function', async () => {
    const mod = await import('@/lib/actions/auth')
    expect(typeof mod.updatePassword).toBe('function')
  })
})

describe('components/auth/sign-out-button module exports', () => {
  it('exports SignOutButton as a function (React component)', async () => {
    const mod = await import('@/components/auth/sign-out-button')
    expect(typeof mod.SignOutButton).toBe('function')
  })
})

// ─── next/navigation redirect: capture path, throw to halt like the real one ──
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`)
})
vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
}))

// ─── auth-logger / site-url: inert ───────────────────────────────────────────
vi.mock('@/lib/auth-logger', () => ({ logAuthEvent: vi.fn() }))
vi.mock('@/lib/utils/site-url', () => ({ getCanonicalBaseUrl: () => 'https://app.test' }))

// ─── supabase server client ──────────────────────────────────────────────────
const authSignUp = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signUp: (...a: unknown[]) => authSignUp(...a),
    },
  }),
}))

function buildFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('signUp: GoTrue anti-enumeration (existing confirmed account)', () => {
  it('returns an already-exists error and does NOT redirect when identities is empty (already-registered confirmed account)', async () => {
    authSignUp.mockResolvedValue({
      data: { user: { id: 'fabricated', identities: [] }, session: null },
      error: null,
    })
    const { signUp } = await import('@/lib/actions/auth')

    await expect(signUp(buildFormData({ email: 'a@b.co', password: 'pw' }))).resolves.toEqual({
      error: 'An account with this email already exists. Sign in instead.',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('redirects to /onboarding for a genuinely new user (non-empty identities)', async () => {
    authSignUp.mockResolvedValue({
      data: { user: { id: 'u1', identities: [{ id: 'i1', provider: 'email' }] }, session: null },
      error: null,
    })
    const { signUp } = await import('@/lib/actions/auth')

    await expect(
      signUp(buildFormData({ email: 'a@b.co', password: 'pw' }))
    ).rejects.toThrow('NEXT_REDIRECT:/onboarding')
    expect(redirect).toHaveBeenCalledWith('/onboarding')
  })

  it('is inert (still redirects, no TypeError) for legacy mocks with no `data` key', async () => {
    authSignUp.mockResolvedValue({ error: null })
    const { signUp } = await import('@/lib/actions/auth')

    await expect(
      signUp(buildFormData({ email: 'a@b.co', password: 'pw' }))
    ).rejects.toThrow('NEXT_REDIRECT:/onboarding')
    expect(redirect).toHaveBeenCalledWith('/onboarding')
  })
})
