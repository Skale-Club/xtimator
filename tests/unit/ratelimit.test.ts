import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock @upstash/redis BEFORE importing the modules under test
const redisStore = new Map<string, number>()
const ttlStore = new Map<string, number>()

const incrMock = vi.fn(async (key: string) => {
  const next = (redisStore.get(key) ?? 0) + 1
  redisStore.set(key, next)
  return next
})

const expireMock = vi.fn(async (key: string, seconds: number, _mode?: string) => {
  if (!ttlStore.has(key)) ttlStore.set(key, seconds)
  return 1
})

const ttlMock = vi.fn(async (key: string) => ttlStore.get(key) ?? -1)

const getMock = vi.fn(async (key: string) => redisStore.get(key) ?? null)

const multiMock = vi.fn(() => {
  const ops: Array<() => Promise<number | 0 | 1>> = []
  return {
    incr: (key: string) => {
      ops.push(() => incrMock(key))
    },
    expire: (key: string, seconds: number, mode: string) => {
      ops.push(() => expireMock(key, seconds, mode) as Promise<0 | 1>)
    },
    exec: async () => {
      const out: Array<number | 0 | 1> = []
      for (const fn of ops) out.push(await fn())
      return out
    },
  }
})

// Project pattern (Phase 08 decision): class-based factory for constructable mocks.
// Class is defined inside the factory because vi.mock is hoisted to the top of the
// file before module-level statements execute.
vi.mock('@upstash/redis', () => {
  return {
    Redis: class MockRedis {
      multi = multiMock
      ttl = ttlMock
      get = getMock
    },
  }
})

// Now import modules under test
import { rateLimit, getRateLimitCount, limits } from '@/lib/ratelimit'
import { __resetRedisCache } from '@/lib/redis'

beforeEach(() => {
  redisStore.clear()
  ttlStore.clear()
  incrMock.mockClear()
  expireMock.mockClear()
  ttlMock.mockClear()
  getMock.mockClear()
  multiMock.mockClear()
  // Ensure env is set so getRedis returns the (mocked) client
  process.env.UPSTASH_REDIS_REST_URL = 'https://test'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
  __resetRedisCache()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('rateLimit', () => {
  it('allows the first request and increments counter', async () => {
    const r = await rateLimit('userEstimatePerHour', 'user-1')
    expect(r.allowed).toBe(true)
    expect(r.count).toBe(1)
    expect(r.max).toBe(limits.userEstimatePerHour.max)
  })

  it('sets TTL only on first request (EXPIRE NX preserves window)', async () => {
    await rateLimit('userEstimatePerHour', 'user-1')
    await rateLimit('userEstimatePerHour', 'user-1')
    // Both calls invoke EXPIRE NX; the mocked store only writes TTL once
    expect(ttlStore.get('rate:userEstimatePerHour:user-1')).toBe(
      limits.userEstimatePerHour.window
    )
  })

  it('isolates counters per identifier', async () => {
    const a = await rateLimit('userEstimatePerHour', 'user-1')
    const b = await rateLimit('userEstimatePerHour', 'user-2')
    expect(a.count).toBe(1)
    expect(b.count).toBe(1)
  })

  it('isolates counters per limit name', async () => {
    const a = await rateLimit('userEstimatePerHour', 'user-1')
    const b = await rateLimit('userEstimatePerDay', 'user-1')
    expect(a.count).toBe(1)
    expect(b.count).toBe(1)
  })

  it('denies when count exceeds max and includes retryAfter', async () => {
    const max = limits.translatePerMinute.max
    let lastResult
    for (let i = 0; i < max + 1; i++) {
      lastResult = await rateLimit('translatePerMinute', 'user-1')
    }
    expect(lastResult?.allowed).toBe(false)
    expect(lastResult?.count).toBe(max + 1)
    expect(lastResult?.retryAfter).toBe(limits.translatePerMinute.window)
  })

  it('fails open when Redis is not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    __resetRedisCache()
    const r = await rateLimit('userEstimatePerHour', 'user-1')
    expect(r.allowed).toBe(true)
  })

  it('fails open when Redis throws', async () => {
    multiMock.mockImplementationOnce(() => {
      throw new Error('redis down')
    })
    const r = await rateLimit('userEstimatePerHour', 'user-1')
    expect(r.allowed).toBe(true)
  })
})

describe('getRateLimitCount', () => {
  it('returns 0 when no requests have been made', async () => {
    const c = await getRateLimitCount('userEstimatePerHour', 'fresh-user')
    expect(c).toBe(0)
  })

  it('returns current count after increments', async () => {
    await rateLimit('userEstimatePerHour', 'user-1')
    await rateLimit('userEstimatePerHour', 'user-1')
    const c = await getRateLimitCount('userEstimatePerHour', 'user-1')
    expect(c).toBe(2)
  })

  it('returns 0 when Redis is not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    __resetRedisCache()
    const c = await getRateLimitCount('userEstimatePerHour', 'user-1')
    expect(c).toBe(0)
  })
})
