import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as legal } from '@/app/admin/legal/route'
import { GET as whatsapp } from '@/app/admin/whatsapp/route'
import { GET as templates } from '@/app/admin/whatsapp-templates/route'
import { requireAdmin } from '@/lib/auth/admin-context'

vi.mock('@/lib/auth/admin-context', () => ({ requireAdmin: vi.fn() }))
const authorize = vi.mocked(requireAdmin)

describe.each([
  { name: 'legal', handler: legal, destination: '/admin/pages' },
  { name: 'whatsapp', handler: whatsapp, destination: '/admin/inbox' },
  { name: 'templates', handler: templates, destination: '/admin/inbox/settings?tab=templates' },
])('admin $name bookmark', ({ handler, destination }) => {
  beforeEach(() => { authorize.mockReset() })

  it('returns a private HTTP307 only after successful authorization', async () => {
    authorize.mockResolvedValueOnce({} as Awaited<ReturnType<typeof requireAdmin>>)
    const response = await handler()
    expect(authorize).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(destination)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.body).toBeNull()
  })

  it('propagates denied authorization before producing a canonical destination', async () => {
    const denied = new Error('NEXT_REDIRECT: admin access denied')
    authorize.mockRejectedValueOnce(denied)
    await expect(handler()).rejects.toBe(denied)
  })

  it('does not finish a response while authorization remains unresolved', async () => {
    let allow!: (value: Awaited<ReturnType<typeof requireAdmin>>) => void
    authorize.mockReturnValueOnce(new Promise(resolve => { allow = resolve }))
    let finished = false
    const result = handler().then(response => { finished = true; return response })
    await Promise.resolve()
    expect(finished).toBe(false)
    allow({} as Awaited<ReturnType<typeof requireAdmin>>)
    expect((await result).headers.get('location')).toBe(destination)
  })
})
