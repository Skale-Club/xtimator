import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

const Page = (await import('@/app/(app)/settings/integrations/stripe/page')).default

describe('/settings/integrations/stripe', () => {
  it('redirects to /settings/client-actions', async () => {
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'REDIRECT:/settings/client-actions',
    )
  })

  it('preserves the query string', async () => {
    await expect(
      Page({ searchParams: Promise.resolve({ connected: '1' }) }),
    ).rejects.toThrow('REDIRECT:/settings/client-actions?connected=1')
    await expect(
      Page({ searchParams: Promise.resolve({ error: 'payments_off' }) }),
    ).rejects.toThrow('REDIRECT:/settings/client-actions?error=payments_off')
  })
})
