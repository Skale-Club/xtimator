import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Tests for lib/actions/theme.ts -- saveThemePreference (DARK-02 (b)).
 *
 * Strategy:
 *   - vi.mock('@/lib/supabase/server') -> chainable builder whose
 *       supabase.from('companies').update(...).eq(...) resolves with
 *       { error: null } on happy path or { error: { message: 'rls denied' } } on failure.
 *   - vi.mock('next/headers') -> in-memory cookieStore with spied .set.
 *
 * Each test re-imports the action via dynamic import after vi.resetModules() so
 * mocks are honoured (mirrors the pattern in tests/unit/branding-actions.test.ts).
 */

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

// saveThemePreference now scopes the update to the active company via getActiveCompanyId()
// (cookie-based) instead of the user's id; mock it so the flow reaches the companies update.
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn().mockResolvedValue('company-active'),
}))

type CookieStoreMock = {
  set: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
}

function makeCookieStore(): CookieStoreMock {
  const data = new Map<string, string>()
  return {
    set: vi.fn((name: string, value: string) => {
      data.set(name, value)
    }),
    get: vi.fn((name: string) => {
      const v = data.get(name)
      return v ? { name, value: v } : undefined
    }),
  }
}

type SupabaseMock = {
  auth: { getClaims: ReturnType<typeof vi.fn> }
  from: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
}

function makeSupabaseClient(opts: {
  claims?: { sub: string } | null
  updateError?: { message: string } | null
}): SupabaseMock {
  const eq = vi.fn().mockResolvedValue({ error: opts.updateError ?? null })
  const update = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ update })
  const getClaims = vi.fn().mockResolvedValue({
    data: opts.claims === null ? { claims: null } : { claims: opts.claims ?? { sub: 'user-123' } },
  })

  return {
    auth: { getClaims },
    from,
    update,
    eq,
  }
}

describe('saveThemePreference (DARK-02 (b))', () => {
  let cookieStore: CookieStoreMock

  beforeEach(async () => {
    vi.resetModules()
    cookieStore = makeCookieStore()

    const headers = await import('next/headers')
    ;(headers.cookies as unknown as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValue(cookieStore)

    const server = await import('@/lib/supabase/server')
    ;(server.createClient as unknown as ReturnType<typeof vi.fn>).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns ok:false with "Invalid theme preference" on invalid input and does NOT touch DB or cookie', async () => {
    const server = await import('@/lib/supabase/server')
    const client = makeSupabaseClient({})
    ;(server.createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(client)

    const { saveThemePreference } = await import('@/lib/actions/theme')
    const result = await saveThemePreference('xyz' as unknown as 'dark')

    expect(result).toEqual({ ok: false, message: 'Invalid theme preference' })
    expect(server.createClient as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
    expect(client.from).not.toHaveBeenCalled()
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('returns ok:false with "Not authenticated" when claims are null', async () => {
    const server = await import('@/lib/supabase/server')
    const client = makeSupabaseClient({ claims: null })
    ;(server.createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(client)

    const { saveThemePreference } = await import('@/lib/actions/theme')
    const result = await saveThemePreference('dark')

    expect(result).toEqual({ ok: false, message: 'Not authenticated' })
    expect(client.from).not.toHaveBeenCalled()
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('authenticated dark: returns ok:true, calls supabase.update with theme_preference:dark, writes eb-theme=dark cookie', async () => {
    const server = await import('@/lib/supabase/server')
    const client = makeSupabaseClient({ claims: { sub: 'user-abc' } })
    ;(server.createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(client)

    const { saveThemePreference } = await import('@/lib/actions/theme')
    const result = await saveThemePreference('dark')

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledWith('companies')
    expect(client.update).toHaveBeenCalledWith({ theme_preference: 'dark' })
    // Per-company theme: update is scoped to the active company id, not the user id.
    expect(client.eq).toHaveBeenCalledWith('id', 'company-active')

    expect(cookieStore.set).toHaveBeenCalledTimes(1)
    const [name, value, options] = cookieStore.set.mock.calls[0]
    expect(name).toBe('eb-theme')
    expect(value).toBe('dark')
    expect(options).toMatchObject({ path: '/', sameSite: 'lax' })
  })

  it('authenticated system: returns ok:true and writes eb-theme=system cookie', async () => {
    const server = await import('@/lib/supabase/server')
    const client = makeSupabaseClient({ claims: { sub: 'user-xyz' } })
    ;(server.createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(client)

    const { saveThemePreference } = await import('@/lib/actions/theme')
    const result = await saveThemePreference('system')

    expect(result).toEqual({ ok: true })
    expect(client.update).toHaveBeenCalledWith({ theme_preference: 'system' })
    expect(cookieStore.set).toHaveBeenCalledWith(
      'eb-theme',
      'system',
      expect.objectContaining({ path: '/', sameSite: 'lax' })
    )
  })

  it('supabase update error: returns ok:false with supabase message and does NOT write cookie', async () => {
    const server = await import('@/lib/supabase/server')
    const client = makeSupabaseClient({
      claims: { sub: 'user-abc' },
      updateError: { message: 'rls denied' },
    })
    ;(server.createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(client)

    const { saveThemePreference } = await import('@/lib/actions/theme')
    const result = await saveThemePreference('light')

    expect(result).toEqual({ ok: false, message: 'rls denied' })
    expect(client.update).toHaveBeenCalledWith({ theme_preference: 'light' })
    expect(cookieStore.set).not.toHaveBeenCalled()
  })
})
