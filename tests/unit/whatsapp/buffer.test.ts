import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Per-test Redis state
const lists = new Map<string, string[]>()
const expires = new Map<string, number>()

const rpushMock = vi.fn(async (key: string, value: string) => {
  const list = lists.get(key) ?? []
  list.push(value)
  lists.set(key, list)
  return list.length
})

const expireMock = vi.fn(async (key: string, seconds: number) => {
  expires.set(key, seconds)
  return 1
})

const lrangeMock = vi.fn(async (key: string) => lists.get(key) ?? [])

const delMock = vi.fn(async (key: string) => {
  const had = lists.has(key)
  lists.delete(key)
  expires.delete(key)
  return had ? 1 : 0
})

const multiMock = vi.fn(() => {
  const ops: Array<() => Promise<unknown>> = []
  return {
    rpush: (key: string, value: string) => {
      ops.push(() => rpushMock(key, value))
    },
    expire: (key: string, seconds: number) => {
      ops.push(() => expireMock(key, seconds))
    },
    exec: async () => Promise.all(ops.map((fn) => fn())),
  }
})

vi.mock('@upstash/redis', () => ({
  Redis: class {
    multi = multiMock
    lrange = lrangeMock
    del = delMock
  },
}))

import {
  pushToBuffer,
  tryClaimBuffer,
  clearBuffer,
  DEBOUNCE_WAIT_MS,
} from '@/lib/whatsapp/buffer'
import { __resetRedisCache } from '@/lib/redis'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

function fakeMessage(id: string, type: 'text' | 'audio' | 'image' = 'text'): WhatsAppMessage {
  return {
    id,
    from: '15551234567',
    timestamp: '1234567890',
    type,
    text: type === 'text' ? { body: `body-${id}` } : undefined,
  } as WhatsAppMessage
}

beforeEach(() => {
  lists.clear()
  expires.clear()
  rpushMock.mockClear()
  expireMock.mockClear()
  lrangeMock.mockClear()
  delMock.mockClear()
  multiMock.mockClear()
  process.env.UPSTASH_REDIS_REST_URL = 'https://test'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
  __resetRedisCache()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pushToBuffer', () => {
  it('appends message to a phone-keyed list and sets TTL', async () => {
    const ok = await pushToBuffer('15551234567', fakeMessage('wamid.1'))
    expect(ok).toBe(true)
    expect(lists.get('buffer:whatsapp:15551234567')).toHaveLength(1)
    expect(expires.get('buffer:whatsapp:15551234567')).toBeGreaterThan(0)
  })

  it('appends multiple messages preserving order', async () => {
    await pushToBuffer('15551234567', fakeMessage('wamid.1'))
    await pushToBuffer('15551234567', fakeMessage('wamid.2', 'audio'))
    await pushToBuffer('15551234567', fakeMessage('wamid.3', 'image'))
    const stored = lists.get('buffer:whatsapp:15551234567')!.map((s) => JSON.parse(s))
    expect(stored.map((e) => e.id)).toEqual(['wamid.1', 'wamid.2', 'wamid.3'])
  })

  it('returns false when Redis is unavailable', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    __resetRedisCache()
    const ok = await pushToBuffer('15551234567', fakeMessage('wamid.1'))
    expect(ok).toBe(false)
  })
})

describe('tryClaimBuffer', () => {
  it('returns full array AND clears buffer when called with the latest message id', async () => {
    await pushToBuffer('15551234567', fakeMessage('wamid.1'))
    await pushToBuffer('15551234567', fakeMessage('wamid.2'))
    await pushToBuffer('15551234567', fakeMessage('wamid.3'))

    const batch = await tryClaimBuffer('15551234567', 'wamid.3')
    expect(batch).not.toBeNull()
    expect(batch!.map((e) => e.id)).toEqual(['wamid.1', 'wamid.2', 'wamid.3'])
    // Buffer was cleared
    expect(lists.get('buffer:whatsapp:15551234567')).toBeUndefined()
  })

  it('returns null when called with a non-latest message id (newer arrived)', async () => {
    await pushToBuffer('15551234567', fakeMessage('wamid.1'))
    await pushToBuffer('15551234567', fakeMessage('wamid.2'))
    const batch = await tryClaimBuffer('15551234567', 'wamid.1')
    expect(batch).toBeNull()
    // Buffer still has both entries (newer's worker will claim them)
    expect(lists.get('buffer:whatsapp:15551234567')).toHaveLength(2)
  })

  it('returns null when buffer is empty', async () => {
    const batch = await tryClaimBuffer('15551234567', 'wamid.1')
    expect(batch).toBeNull()
  })

  it('returns null when Redis is unavailable', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    __resetRedisCache()
    const batch = await tryClaimBuffer('15551234567', 'wamid.1')
    expect(batch).toBeNull()
  })

  it('handles entries pre-parsed by Upstash (object instead of string)', async () => {
    // Some Upstash setups auto-deserialize. Simulate by storing raw objects.
    lists.set('buffer:whatsapp:15551234567', [
      // @ts-expect-error simulating non-string entry
      { id: 'wamid.1', receivedAt: Date.now(), message: fakeMessage('wamid.1') },
    ])
    const batch = await tryClaimBuffer('15551234567', 'wamid.1')
    expect(batch).not.toBeNull()
    expect(batch!.map((e) => e.id)).toEqual(['wamid.1'])
  })
})

describe('clearBuffer', () => {
  it('removes the phone-keyed list', async () => {
    await pushToBuffer('15551234567', fakeMessage('wamid.1'))
    await clearBuffer('15551234567')
    expect(lists.get('buffer:whatsapp:15551234567')).toBeUndefined()
  })

  it('is a no-op when Redis unavailable', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    __resetRedisCache()
    await expect(clearBuffer('15551234567')).resolves.toBeUndefined()
  })
})

describe('config sanity', () => {
  it('DEBOUNCE_WAIT_MS is 5 seconds', () => {
    expect(DEBOUNCE_WAIT_MS).toBe(5_000)
  })
})
