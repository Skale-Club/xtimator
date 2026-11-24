import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/(app)/settings/(tabs)/defaults/route'
import { GET as payments } from '@/app/(app)/settings/payments/route'
import { DEMO_COMPANY_ID } from '@/lib/demo/config'
import { getActiveCompanyId } from '@/lib/queries/active-company'

vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))

const activeCompany = vi.mocked(getActiveCompanyId)

describe.each([
  { route: '/settings/defaults', handler: GET, ordinary: '/settings/estimates' },
  { route: '/settings/payments', handler: payments, ordinary: '/settings/client-actions' },
])('GET $route', ({ handler, ordinary }) => {
  beforeEach(() => {
    activeCompany.mockReset()
  })

  it.each([
    { label: 'demo company', companyId: DEMO_COMPANY_ID, location: '/settings/company' },
    { label: 'ordinary company', companyId: randomUUID(), location: ordinary },
    { label: 'no active company', companyId: null, location: ordinary },
  ])('returns a private temporary redirect for $label', async ({ companyId, location }) => {
    activeCompany.mockResolvedValueOnce(companyId)

    const response = await handler()

    expect(activeCompany).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(location)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.body).toBeNull()
  })

  it('propagates a company resolver failure', async () => {
    const readError = new Error('Active company lookup unavailable')
    activeCompany.mockRejectedValueOnce(readError)

    await expect(handler()).rejects.toBe(readError)
  })
})
