import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Phase 187 Plan 03 — PROXY-03: unit coverage for canReadPrivateKey
 * (lib/storage/proxy-auth.ts), the tenant-ownership gate the route handler
 * calls before ever touching photos/audio/pdfs.
 */

vi.mock('@/lib/queries/auth', () => ({
  getAuthClaims: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { canReadPrivateKey } from '@/lib/storage/proxy-auth'
import { getAuthClaims } from '@/lib/queries/auth'
import { createClient } from '@/lib/supabase/server'

const VALID_COMPANY_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'

function makeSupabaseMock(membership: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: membership })
  const eq2 = vi.fn().mockReturnValue({ maybeSingle })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  const from = vi.fn().mockReturnValue({ select })
  return { from, __eq1: eq1, __eq2: eq2, __select: select }
}

describe('canReadPrivateKey', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('refuses a key whose first segment is not a UUID, without touching auth or the DB', async () => {
    const result = await canReadPrivateKey('user-avatars/x/avatar.webp')

    expect(result).toBe(false)
    expect(getAuthClaims).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuses a legacy non-UUID key, e.g. a smoke-test key', async () => {
    const result = await canReadPrivateKey('smoke/1.txt')

    expect(result).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuses when there are no auth claims at all, and issues zero DB queries', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue(null)

    const result = await canReadPrivateKey(`${VALID_COMPANY_ID}/projectA/photo.webp`)

    expect(result).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuses when claims are present but sub is missing, and issues zero DB queries', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue({} as never)

    const result = await canReadPrivateKey(`${VALID_COMPANY_ID}/projectA/photo.webp`)

    expect(result).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('allows an authenticated caller with a company_members row for the key company', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-1' } as never)
    const supabase = makeSupabaseMock({ company_id: VALID_COMPANY_ID })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await canReadPrivateKey(`${VALID_COMPANY_ID}/projectA/photo.webp`)

    expect(result).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('company_members')
    expect(supabase.__eq1).toHaveBeenCalledWith('user_id', 'user-1')
    expect(supabase.__eq2).toHaveBeenCalledWith('company_id', VALID_COMPANY_ID)
  })

  it('refuses a cross-tenant caller (authenticated, but no membership row)', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-1' } as never)
    const supabase = makeSupabaseMock(null)
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await canReadPrivateKey(`${VALID_COMPANY_ID}/projectA/photo.webp`)

    expect(result).toBe(false)
  })

  it('fails closed (returns false, never throws) when the query itself throws', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-1' } as never)
    vi.mocked(createClient).mockRejectedValue(new Error('connection reset'))

    await expect(
      canReadPrivateKey(`${VALID_COMPANY_ID}/projectA/photo.webp`)
    ).resolves.toBe(false)
  })

  it('never imports a service-role client (RLS-bound createClient is the only DB path)', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/storage/proxy-auth.ts'),
      'utf-8'
    )

    expect(source).not.toMatch(/requireServiceClient|createServiceClient/)
  })
})
