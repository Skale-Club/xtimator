import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 193-02 — unlockEstimate (app/estimate/[token]/actions.ts).
 *
 * Covers: rate-limit-first ordering (denies before any DB lookup), no-oracle
 * failure (unknown token / no password set / wrong password all return the
 * SAME generic error), successful unlock sets the signed cookie + inserts
 * unlock_ok, a wrong password inserts unlock_fail, and a demo-owned estimate
 * skips the engagement-event write without blocking the unlock/deny outcome.
 *
 * Mocking style mirrors tests/unit/actions/respond-to-estimate-race-guard.test.ts
 * (single fromImpl dispatched by table) and
 * tests/unit/api/track-estimate-route-contract.test.ts (rate-limit-first).
 */

const mockRateLimit = vi.fn()
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))

const mockAssertWritable = vi.fn()
const mockAssertCompanyWritable = vi.fn()
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: (...args: unknown[]) => mockAssertWritable(...args),
  assertCompanyWritable: (...args: unknown[]) => mockAssertCompanyWritable(...args),
}))

vi.mock('@/lib/estimate/notify-response', () => ({
  notifyEstimateResponse: vi.fn(),
}))

const mockHeaders = vi.fn()
const mockCookiesGet = vi.fn()
const mockCookiesSet = vi.fn()
vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
  cookies: () => Promise.resolve({ get: mockCookiesGet, set: mockCookiesSet }),
}))

const fromImpl = vi.fn()
const insertMock = vi.fn().mockResolvedValue({ data: null, error: null })
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: (t: string) => fromImpl(t) }),
}))

function configureSupabase(estimateRow: Record<string, unknown> | null) {
  fromImpl.mockImplementation((table: string) => {
    if (table === 'estimates') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: estimateRow }),
          }),
        }),
      }
    }
    if (table === 'estimate_engagement_events') {
      return { insert: insertMock }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64')
  mockRateLimit.mockResolvedValue({ allowed: true, count: 1, max: 5 })
  mockAssertWritable.mockResolvedValue(null)
  mockAssertCompanyWritable.mockResolvedValue(null)
  mockHeaders.mockReturnValue(new Headers({ 'x-forwarded-for': '198.51.100.9' }))
  mockCookiesGet.mockReturnValue(undefined)
  configureSupabase(null)
})

async function hashedRow(password: string, overrides: Record<string, unknown> = {}) {
  const { hashSharePassword } = await import('@/lib/auth/share-password')
  return {
    id: 'est_1',
    company_id: 'co_1',
    share_password_hash: hashSharePassword(password),
    ...overrides,
  }
}

describe('unlockEstimate — rate limiting runs first', () => {
  it('denies before ever calling requireServiceClient when the limiter blocks', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, count: 6, max: 5, retryAfter: 30 })
    const { unlockEstimate } = await import('@/app/estimate/[token]/actions')

    const result = await unlockEstimate('tok_1', 'anything')

    expect(result).toEqual({
      success: false,
      error: 'Too many attempts. Please wait a minute and try again.',
    })
    expect(fromImpl).not.toHaveBeenCalled()
  })

  it('keys the limiter on ip + a truncated hash of the token (never the raw token)', async () => {
    const { unlockEstimate } = await import('@/app/estimate/[token]/actions')
    await unlockEstimate('tok_1', 'anything')

    expect(mockRateLimit).toHaveBeenCalledWith('estimateUnlockPerMinute', expect.any(String))
    const [, identifier] = mockRateLimit.mock.calls[0]
    expect(identifier).toContain('198.51.100.9:')
    expect(identifier as string).not.toContain('tok_1')
  })
})

describe('unlockEstimate — no oracle on failure', () => {
  it('unknown token -> generic error, records unlock_fail is skipped (no estimate to attach it to)', async () => {
    configureSupabase(null)
    const { unlockEstimate } = await import('@/app/estimate/[token]/actions')

    const result = await unlockEstimate('nope', 'anything')

    expect(result).toEqual({ success: false, error: 'Incorrect password. Please try again.' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('estimate exists but has no password set -> same generic error', async () => {
    configureSupabase({ id: 'est_1', company_id: 'co_1', share_password_hash: null })
    const { unlockEstimate } = await import('@/app/estimate/[token]/actions')

    const result = await unlockEstimate('tok_1', 'anything')

    expect(result).toEqual({ success: false, error: 'Incorrect password. Please try again.' })
  })

  it('wrong password -> same generic error, and inserts an unlock_fail event', async () => {
    configureSupabase(await hashedRow('correct-password'))
    const { unlockEstimate } = await import('@/app/estimate/[token]/actions')

    const result = await unlockEstimate('tok_1', 'wrong-password')

    expect(result).toEqual({ success: false, error: 'Incorrect password. Please try again.' })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        estimate_id: 'est_1',
        company_id: 'co_1',
        event_type: 'unlock_fail',
      })
    )
    expect(mockCookiesSet).not.toHaveBeenCalled()
  })
})

describe('unlockEstimate — success path', () => {
  it('correct password -> sets the signed unlock cookie and inserts unlock_ok', async () => {
    configureSupabase(await hashedRow('correct-password'))
    const { unlockEstimate } = await import('@/app/estimate/[token]/actions')

    const result = await unlockEstimate('tok_1', 'correct-password')

    expect(result).toEqual({ success: true })
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'estimate_unlock',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' })
    )
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        estimate_id: 'est_1',
        company_id: 'co_1',
        event_type: 'unlock_ok',
      })
    )
  })

  it('the minted cookie actually authorizes THIS token via hasValidUnlock', async () => {
    configureSupabase(await hashedRow('correct-password'))
    const { unlockEstimate } = await import('@/app/estimate/[token]/actions')
    const { hasValidUnlock } = await import('@/lib/auth/share-password')

    await unlockEstimate('tok_1', 'correct-password')

    const mintedValue = mockCookiesSet.mock.calls[0][1] as string
    expect(hasValidUnlock(mintedValue, 'tok_1')).toBe(true)
    expect(hasValidUnlock(mintedValue, 'some-other-token')).toBe(false)
  })
})

describe('unlockEstimate — demo-owned estimate suppresses the engagement-event write only', () => {
  it('assertCompanyWritable denies -> unlock still succeeds, but no event row is inserted', async () => {
    mockAssertCompanyWritable.mockResolvedValue({ error: 'demo readonly' })
    configureSupabase(await hashedRow('correct-password'))
    const { unlockEstimate } = await import('@/app/estimate/[token]/actions')

    const result = await unlockEstimate('tok_1', 'correct-password')

    expect(result).toEqual({ success: true })
    expect(mockCookiesSet).toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })
})
