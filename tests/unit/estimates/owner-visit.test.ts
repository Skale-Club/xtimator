import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockCookieGet = vi.fn()
const mockGetAuthClaims = vi.fn()
const mockRequireServiceClient = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => mockCookieGet(name) }),
}))
vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: () => mockGetAuthClaims() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => mockRequireServiceClient() }))

import {
  OWNER_DEVICE_COOKIE,
  isOwnerVisit,
  readOwnerDeviceCompanyIds,
  signOwnerDeviceCookie,
} from '@/lib/estimates/owner-visit'

function serviceWithMembers(rows: unknown[] | Error) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.limit = () => (rows instanceof Error ? Promise.reject(rows) : Promise.resolve({ data: rows }))
  return { from: () => chain }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  mockCookieGet.mockReturnValue(undefined)
  mockGetAuthClaims.mockResolvedValue(null)
})

describe('owner device cookie', () => {
  it('round-trips company ids', () => {
    const raw = signOwnerDeviceCookie(['c1', 'c2', 'c1'])
    expect(readOwnerDeviceCompanyIds(raw)).toEqual(['c1', 'c2'])
  })

  it('caps at 10 company ids', () => {
    const ids = Array.from({ length: 15 }, (_, i) => `c${i}`)
    expect(readOwnerDeviceCompanyIds(signOwnerDeviceCookie(ids))).toHaveLength(10)
  })

  it('rejects a tampered signature or payload', () => {
    const raw = signOwnerDeviceCookie(['c1'])
    const [payload, sig] = raw.split('.')
    expect(readOwnerDeviceCompanyIds(`${payload}.${sig.replace(/.$/, sig.endsWith('0') ? '1' : '0')}`)).toEqual([])
    const forged = Buffer.from(JSON.stringify({ c: ['victim'], t: 1 })).toString('base64url')
    expect(readOwnerDeviceCompanyIds(`${forged}.${sig}`)).toEqual([])
  })

  it('treats garbage as empty', () => {
    expect(readOwnerDeviceCompanyIds('garbage')).toEqual([])
    expect(readOwnerDeviceCompanyIds('a.b')).toEqual([])
    expect(readOwnerDeviceCompanyIds('')).toEqual([])
    expect(readOwnerDeviceCompanyIds(undefined)).toEqual([])
  })
})

describe('isOwnerVisit', () => {
  it('is true for a signed-in member of the company', async () => {
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-1' })
    mockRequireServiceClient.mockReturnValue(serviceWithMembers([{ user_id: 'user-1' }]))
    expect(await isOwnerVisit('c1')).toBe(true)
  })

  it('is false for a signed-in non-member', async () => {
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-2' })
    mockRequireServiceClient.mockReturnValue(serviceWithMembers([]))
    expect(await isOwnerVisit('c1')).toBe(false)
  })

  it('is true via the marked-device cookie without a session', async () => {
    mockCookieGet.mockImplementation((name: string) =>
      name === OWNER_DEVICE_COOKIE ? { value: signOwnerDeviceCookie(['c1']) } : undefined
    )
    expect(await isOwnerVisit('c1')).toBe(true)
    expect(mockGetAuthClaims).not.toHaveBeenCalled()
  })

  it('is false for a different company than the cookie holds', async () => {
    mockCookieGet.mockReturnValue({ value: signOwnerDeviceCookie(['c1']) })
    expect(await isOwnerVisit('other')).toBe(false)
  })

  it('is false when a dependency throws', async () => {
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-1' })
    mockRequireServiceClient.mockReturnValue(serviceWithMembers(new Error('db down')))
    expect(await isOwnerVisit('c1')).toBe(false)
    mockGetAuthClaims.mockRejectedValue(new Error('auth down'))
    expect(await isOwnerVisit('c1')).toBe(false)
  })
})
