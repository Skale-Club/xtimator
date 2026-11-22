import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/queries/company', () => ({ getCustomDomainSettings: vi.fn() }))

describe('/settings/custom-domain while hidden', () => {
  it('returns notFound before touching auth or data', async () => {
    const { getAuthClaims } = await import('@/lib/queries/auth')
    const Page = (await import('@/app/(app)/settings/custom-domain/page')).default
    await expect(Page()).rejects.toThrow('NOT_FOUND')
    expect(getAuthClaims).not.toHaveBeenCalled()
  })
})
