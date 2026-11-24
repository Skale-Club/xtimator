import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as legal } from '@/app/admin/legal/route'
import { GET as whatsapp } from '@/app/admin/whatsapp/route'
import { GET as templates } from '@/app/admin/whatsapp-templates/route'
import { getAdminContext } from '@/lib/auth/admin-context'

vi.mock('@/lib/auth/admin-context', () => ({ getAdminContext: vi.fn() }))
const authorize = vi.mocked(getAdminContext)

describe.each([
  { name: 'legal', handler: legal, destination: '/admin/pages' },
  { name: 'whatsapp', handler: whatsapp, destination: '/admin/inbox' },
  { name: 'templates', handler: templates, destination: '/admin/inbox/settings?tab=templates' },
])('admin $name bookmark', ({ handler, destination }) => {
  beforeEach(() => { authorize.mockReset() })

  it('returns a private HTTP307 only after successful authorization', async () => {
    authorize.mockResolvedValueOnce({ userId: 'qa-admin', email: 'qa-admin@example.invalid' })
    const response = await handler()
    expect(authorize).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(destination)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.body).toBeNull()
  })

  it('sends a non-admin to the same logout boundary as the admin layout', async () => {
    authorize.mockResolvedValueOnce(null)
    const response = await handler()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/api/logout')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.body).toBeNull()
  })

  it('propagates failed authorization reads before producing a destination', async () => {
    const denied = new Error('Could not resolve admin authorization')
    authorize.mockRejectedValueOnce(denied)
    await expect(handler()).rejects.toBe(denied)
  })

  it('does not finish a response while authorization remains unresolved', async () => {
    let allow!: (value: Awaited<ReturnType<typeof getAdminContext>>) => void
    authorize.mockReturnValueOnce(new Promise(resolve => { allow = resolve }))
    let finished = false
    const result = handler().then(response => { finished = true; return response })
    await Promise.resolve()
    expect(finished).toBe(false)
    allow({ userId: 'qa-admin', email: 'qa-admin@example.invalid' })
    expect((await result).headers.get('location')).toBe(destination)
  })
})
