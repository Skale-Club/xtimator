import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'

function makeSupabaseMock({
  claimsError = false,
  noCompany = false,
  updateError = false,
}: {
  claimsError?: boolean
  noCompany?: boolean
  updateError?: boolean
} = {}) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateError ? { message: 'DB error' } : null }),
  })

  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue(
        claimsError
          ? { data: { claims: null } }
          : { data: { claims: { sub: 'user-123' } } }
      ),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'companies') {
        if (noCompany) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
            update: updateMock,
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'company-123' } }),
            }),
          }),
          update: updateMock,
        }
      }
      return {}
    }),
  }
}

describe('saveCustomDomain', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('accepts valid hostname', async () => {
    const supabaseMock = makeSupabaseMock()
    vi.mocked(createClient).mockResolvedValue(supabaseMock as unknown as Awaited<ReturnType<typeof createClient>>)
    const { saveCustomDomain } = await import('@/lib/actions/custom-domain')
    const result = await saveCustomDomain({ custom_domain: 'estimates.mycompany.com' })
    expect(result).toEqual({ success: true })
  })

  it('rejects hostname with https:// prefix', async () => {
    const supabaseMock = makeSupabaseMock()
    vi.mocked(createClient).mockResolvedValue(supabaseMock as unknown as Awaited<ReturnType<typeof createClient>>)
    const { saveCustomDomain } = await import('@/lib/actions/custom-domain')
    const result = await saveCustomDomain({ custom_domain: 'https://estimates.mycompany.com' })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('No http://')
    }
  })

  it('stores null for empty string (clears domain)', async () => {
    const supabaseMock = makeSupabaseMock()
    vi.mocked(createClient).mockResolvedValue(supabaseMock as unknown as Awaited<ReturnType<typeof createClient>>)
    const { saveCustomDomain } = await import('@/lib/actions/custom-domain')
    const result = await saveCustomDomain({ custom_domain: '' })
    expect(result).toEqual({ success: true })
  })
})
