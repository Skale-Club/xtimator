import { describe, it, expect, vi, beforeEach } from 'vitest'

const getDoc = vi.fn()
const getAuth = vi.fn()
const renderMock = vi.fn()
vi.mock('@/lib/change-orders/queries', () => ({ getChangeOrderDocumentById: (id: string) => getDoc(id) }))
vi.mock('@/lib/auth/context', () => ({ getAuthContext: () => getAuth() }))
vi.mock('@/lib/pdf/resolve-pdf-logo', () => ({ resolvePdfLogo: async () => null }))
vi.mock('@react-pdf/renderer', async (orig) => ({
  ...(await orig<typeof import('@react-pdf/renderer')>()),
  renderToBuffer: (el: unknown) => renderMock(el),
}))
vi.mock('@/components/pdf/change-order-pdf', () => ({ default: () => null }))
const rateLimitMock = vi.fn()
vi.mock('@/lib/ratelimit', () => ({ rateLimit: (...a: unknown[]) => rateLimitMock(...a) }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.8' }),
  cookies: async () => ({ get: () => undefined }),
}))

import { GET } from '@/app/api/change-orders/[id]/pdf/route'
import { buildChangeOrderData } from '../share/change-order-fixtures'

function call(query = '') {
  return GET(new Request(`http://localhost/api/change-orders/co1/pdf${query}`), {
    params: Promise.resolve({ id: 'co1' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getDoc.mockResolvedValue(buildChangeOrderData())
  getAuth.mockResolvedValue({ error: 'Not authenticated' })
  renderMock.mockResolvedValue(Buffer.from('%PDF-1.4 test'))
  rateLimitMock.mockResolvedValue({ allowed: true, count: 1, max: 20 })
})

describe('GET /api/change-orders/[id]/pdf', () => {
  it('serves the PDF inline, uncached, to a signed-in member of the same company', async () => {
    getAuth.mockResolvedValue({ userId: 'u1', companyId: 'c1' })
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="SK-1045-CO1.pdf"')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(Buffer.from(await res.arrayBuffer()).toString('latin1', 0, 4)).toBe('%PDF')
  })

  it('serves it to the client holding the matching share token, without a session', async () => {
    const res = await call('?token=tok-co1')
    expect(res.status).toBe(200)
    expect(getAuth).not.toHaveBeenCalled()
  })

  it('404 for a wrong token and an anonymous caller', async () => {
    expect((await call('?token=nope')).status).toBe(404)
    expect((await call()).status).toBe(404)
    expect(renderMock).not.toHaveBeenCalled()
  })

  it('404 for a signed-in user of ANOTHER company', async () => {
    getAuth.mockResolvedValue({ userId: 'u2', companyId: 'other-company' })
    expect((await call()).status).toBe(404)
    expect(renderMock).not.toHaveBeenCalled()
  })

  it('is rate limited by IP + a token hash, before the document is even loaded', async () => {
    await call('?token=tok-co1')
    const [name, key] = rateLimitMock.mock.calls[0]
    expect(name).toBe('publicChangeOrderPerMinute')
    expect(key).toMatch(/^pdf:198.51.100.8:[0-9a-f]{16}$/)
    expect(String(key)).not.toContain('tok-co1')
  })

  it('429 with Retry-After when limited: nothing loaded, nothing rendered', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, count: 21, max: 20, retryAfter: 42 })
    const res = await call('?token=tok-co1')
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    expect(getDoc).not.toHaveBeenCalled()
    expect(renderMock).not.toHaveBeenCalled()
  })

  it('404 for an unknown change order, indistinguishable from an unauthorized one', async () => {
    getDoc.mockResolvedValue(null)
    const res = await call('?token=tok-co1')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Change order not found' })
  })
})
