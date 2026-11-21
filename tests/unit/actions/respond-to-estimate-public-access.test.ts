import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * respondToEstimate (decline) is a public, token-only write. It must honour the
 * same gate as the public page: an expired link and a password-protected link
 * without a valid unlock cookie are refused BEFORE any write, and it is rate
 * limited by client IP + token.
 */

vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn().mockResolvedValue(null),
  assertCompanyWritable: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/estimate/notify-response', () => ({ notifyEstimateResponse: vi.fn().mockResolvedValue(undefined) }))

const mockRateLimit = vi.fn()
vi.mock('@/lib/ratelimit', () => ({ rateLimit: (...a: unknown[]) => mockRateLimit(...a) }))

const mockHeaders = vi.fn()
const mockCookieGet = vi.fn()
vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
  cookies: async () => ({ get: (n: string) => mockCookieGet(n), set: vi.fn() }),
}))
const mockHasValidUnlock = vi.fn()
vi.mock('@/lib/auth/share-password', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/share-password')>()),
  hasValidUnlock: (...a: unknown[]) => mockHasValidUnlock(...a),
}))

const fromImpl = vi.fn()
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: (t: string) => fromImpl(t) }),
}))

import { respondToEstimate } from '@/app/estimate/[token]/actions'

const ROW = {
  id: 'est_1',
  project_id: 'proj_1',
  company_id: 'co_1',
  client_response: null,
  is_current: true,
  estimate_number: 'EST-100',
  share_token: 'tok-1',
  share_expires_at: null as string | null,
  share_password_hash: null as string | null,
}

let row: typeof ROW
let writes: string[]
let estimateSelects: number

beforeEach(() => {
  vi.clearAllMocks()
  row = { ...ROW }
  writes = []
  estimateSelects = 0
  mockRateLimit.mockResolvedValue({ allowed: true, count: 1, max: 10 })
  mockHeaders.mockReturnValue(new Headers({ 'x-forwarded-for': '198.51.100.1' }))
  mockCookieGet.mockReturnValue({ value: 'signed-cookie' })
  mockHasValidUnlock.mockReturnValue(false)
  fromImpl.mockImplementation((table: string) => {
    if (table === 'estimates') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => {
              estimateSelects++
              return { data: row, error: null }
            },
          }),
        }),
        update: () => {
          writes.push('estimates.update')
          return {
            eq() {
              return this
            },
            is: () => ({ select: async () => ({ data: [{ id: 'est_1' }], error: null }) }),
          }
        },
      }
    }
    if (table === 'companies') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { digital_signature_enabled: true } }) }) }),
      }
    }
    if (table === 'projects') {
      return {
        update: () => {
          writes.push('projects.update')
          return { eq: async () => ({ error: null }) }
        },
      }
    }
    if (table === 'estimate_activity') {
      return {
        insert: async () => {
          writes.push('estimate_activity.insert')
          return { error: null }
        },
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
})

describe('respondToEstimate: public link gate', () => {
  it('declines an ordinary link (no password, no expiry)', async () => {
    expect(await respondToEstimate('tok-1', 'declined')).toEqual({ success: true })
    expect(writes).toContain('estimates.update')
  })

  it('refuses an expired link before any write', async () => {
    row.share_expires_at = '2020-01-01T00:00:00.000Z'
    const res = await respondToEstimate('tok-1', 'declined')
    expect(res).toEqual({ success: false, error: 'This estimate link has expired' })
    expect(writes).toEqual([])
  })

  it('refuses a password-protected link without an unlock cookie before any write', async () => {
    row.share_password_hash = 'scrypt$hash'
    mockCookieGet.mockReturnValue(undefined)
    const res = await respondToEstimate('tok-1', 'declined')
    expect(res).toEqual({ success: false, error: 'Please unlock this estimate to continue' })
    expect(writes).toEqual([])
  })

  it('refuses a cookie that does not verify for this share token', async () => {
    row.share_password_hash = 'scrypt$hash'
    mockHasValidUnlock.mockReturnValue(false)
    const res = await respondToEstimate('tok-1', 'declined')
    expect(res.success).toBe(false)
    expect(mockHasValidUnlock).toHaveBeenCalledWith('signed-cookie', 'tok-1')
    expect(writes).toEqual([])
  })

  it('allows a password-protected link with a valid unlock cookie', async () => {
    row.share_password_hash = 'scrypt$hash'
    mockHasValidUnlock.mockReturnValue(true)
    expect(await respondToEstimate('tok-1', 'declined')).toEqual({ success: true })
    expect(writes).toContain('estimates.update')
  })
})

describe('respondToEstimate: rate limit', () => {
  it('is keyed by IP + a token hash (never the raw token)', async () => {
    await respondToEstimate('tok-1', 'declined')
    const [name, key] = mockRateLimit.mock.calls[0]
    expect(name).toBe('publicEstimateResponsePerMinute')
    expect(key).toMatch(/^198\.51\.100\.1:[0-9a-f]{16}$/)
    expect(String(key)).not.toContain('tok-1')
  })

  it('refuses with a plain message and performs no lookup or write when limited', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, count: 11, max: 10, retryAfter: 30 })
    const res = await respondToEstimate('tok-1', 'declined')
    expect(res).toEqual({ success: false, error: 'Too many attempts. Try again in a minute.' })
    expect(estimateSelects).toBe(0)
    expect(writes).toEqual([])
  })
})
