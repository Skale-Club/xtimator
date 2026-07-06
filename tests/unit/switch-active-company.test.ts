// tests/unit/switch-active-company.test.ts
// Phase 81 Plan 02: switchActiveCompany server action.
// Covers SWITCH-06 (six-step sequence), SWITCH-08 (discriminated-union return),
// SWITCH-16 (RLS-bound membership check, no service-role bypass).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------- mocks ----------
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  // Bypass unstable_cache so importing lib/queries/active-company.ts (for the cookie
  // constants) doesn't try to invoke the real Next.js cache layer.
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { cookies } from 'next/headers'
import { revalidatePath, updateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  ACTIVE_COMPANY_COOKIE,
  ACTIVE_COMPANY_COOKIE_OPTIONS,
} from '@/lib/queries/active-company'

// ---------- helpers ----------
function makeCookieStore() {
  const setSpy = vi.fn()
  return {
    store: { set: setSpy },
    setSpy,
  }
}

function buildSupabase({
  claims,
  membership,
}: {
  claims: { sub: string } | null
  membership: { company_id: string } | null
}) {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims },
  })
  const maybeSingle = vi.fn().mockResolvedValue({ data: membership })
  const eq2 = vi.fn().mockReturnValue({ maybeSingle })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  const from = vi.fn().mockReturnValue({ select })
  return {
    client: { auth: { getClaims }, from },
    _spies: { getClaims, from, select, eq1, eq2, maybeSingle },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------- tests ----------
describe('switchActiveCompany — SWITCH-06 / SWITCH-08', () => {
  it('Case A — success: sets cookie + revalidates tag/path, returns { ok: true }', async () => {
    const { store, setSpy } = makeCookieStore()
    vi.mocked(cookies).mockResolvedValue(store as never)
    const supa = buildSupabase({
      claims: { sub: 'user-1' },
      membership: { company_id: 'c-target' },
    })
    vi.mocked(createClient).mockResolvedValue(supa.client as never)

    const { switchActiveCompany } = await import('@/lib/actions/active-company')
    const result = await switchActiveCompany('c-target')

    expect(result).toEqual({ ok: true })
    expect(supa._spies.from).toHaveBeenCalledWith('company_members')
    expect(supa._spies.eq1).toHaveBeenCalledWith('user_id', 'user-1')
    expect(supa._spies.eq2).toHaveBeenCalledWith('company_id', 'c-target')
    expect(setSpy).toHaveBeenCalledWith(
      ACTIVE_COMPANY_COOKIE,
      'c-target',
      ACTIVE_COMPANY_COOKIE_OPTIONS
    )
    expect(vi.mocked(updateTag)).toHaveBeenCalledWith('company')
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/', 'layout')
  })

  it('Case B — forbidden: no membership row → { error: "forbidden" }, no side effects', async () => {
    const { store, setSpy } = makeCookieStore()
    vi.mocked(cookies).mockResolvedValue(store as never)
    const supa = buildSupabase({
      claims: { sub: 'user-1' },
      membership: null,
    })
    vi.mocked(createClient).mockResolvedValue(supa.client as never)

    const { switchActiveCompany } = await import('@/lib/actions/active-company')
    const result = await switchActiveCompany('c-foreign')

    expect(result).toEqual({ error: 'forbidden' })
    expect(setSpy).not.toHaveBeenCalled()
    expect(vi.mocked(updateTag)).not.toHaveBeenCalled()
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })

  it('Case C — unauthenticated: no claims → { error: "unauthenticated" }, no DB call', async () => {
    const { store, setSpy } = makeCookieStore()
    vi.mocked(cookies).mockResolvedValue(store as never)
    const supa = buildSupabase({
      claims: null,
      membership: null,
    })
    vi.mocked(createClient).mockResolvedValue(supa.client as never)

    const { switchActiveCompany } = await import('@/lib/actions/active-company')
    const result = await switchActiveCompany('c-target')

    expect(result).toEqual({ error: 'unauthenticated' })
    expect(supa._spies.from).not.toHaveBeenCalled()
    expect(setSpy).not.toHaveBeenCalled()
    expect(vi.mocked(updateTag)).not.toHaveBeenCalled()
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })
})
