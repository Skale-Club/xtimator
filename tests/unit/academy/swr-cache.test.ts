import { describe, it, expect, vi } from 'vitest'
import { createSwrCache } from '@/lib/academy/swr-cache'

function clock() {
  let t = 0
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('createSwrCache', () => {
  it('serves a fresh value without reloading', async () => {
    const c = clock()
    const cache = createSwrCache<number>({ ttlMs: 1000, now: c.now })
    const loader = vi.fn().mockResolvedValue(1)
    await cache.get('k', loader)
    c.advance(500)
    expect(await cache.get('k', loader)).toBe(1)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('serves stale immediately and refreshes in the background', async () => {
    const c = clock()
    const cache = createSwrCache<number>({ ttlMs: 1000, now: c.now })
    await cache.get('k', async () => 1)
    c.advance(2000)
    const loader = vi.fn().mockResolvedValue(2)
    expect(await cache.get('k', loader)).toBe(1)
    await settle()
    expect(await cache.get('k', loader)).toBe(2)
  })

  it('keeps serving stale when the background refresh fails', async () => {
    const c = clock()
    const cache = createSwrCache<number>({ ttlMs: 1000, now: c.now })
    await cache.get('k', async () => 1)
    c.advance(2000)
    expect(await cache.get('k', () => Promise.reject(new Error('down')))).toBe(1)
    await settle()
  })

  it('deduplicates concurrent first loads', async () => {
    const cache = createSwrCache<number>({ ttlMs: 1000 })
    const loader = vi.fn().mockResolvedValue(7)
    const [a, b] = await Promise.all([cache.get('k', loader), cache.get('k', loader)])
    expect([a, b]).toEqual([7, 7])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('returns the fallback on a failed first load and retries after errorTtlMs', async () => {
    const c = clock()
    const cache = createSwrCache<number[]>({ ttlMs: 300_000, errorTtlMs: 60_000, now: c.now })
    const failing = vi.fn().mockRejectedValue(new Error('notion down'))
    expect(await cache.get('k', failing, [])).toEqual([])
    c.advance(30_000)
    await cache.get('k', failing, [])
    expect(failing).toHaveBeenCalledTimes(1) // negative result is cached
    c.advance(40_000) // past errorTtl
    const ok = vi.fn().mockResolvedValue([1])
    await cache.get('k', ok, [])
    await settle()
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('rejects a failed first load when no fallback is given', async () => {
    const cache = createSwrCache<number>({ ttlMs: 1000 })
    await expect(cache.get('k', () => Promise.reject(new Error('x')))).rejects.toThrow('x')
  })
})
