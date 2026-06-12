import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const swSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

describe('PWA service worker caching contract', () => {
  it('serves navigations with a network-first strategy to avoid stale Next.js HTML', () => {
    expect(swSource).toContain("const CACHE_V = 'v3'")
    expect(swSource).toContain('event.respondWith(networkFirstWithFallback(PAGES, request))')
    expect(swSource).not.toContain('staleWhileRevalidateWithFallback')

    const helperStart = swSource.indexOf('async function networkFirstWithFallback')
    const helperEnd = swSource.indexOf("self.addEventListener('push'", helperStart)
    const helperSource = swSource.slice(helperStart, helperEnd)

    expect(helperStart).toBeGreaterThan(-1)
    expect(helperSource.indexOf('await fetch(request)')).toBeLessThan(
      helperSource.indexOf('await cache.match(request)')
    )
  })

  it('keeps hashed static assets cache-first', () => {
    expect(swSource).toContain("url.pathname.startsWith('/_next/static/')")
    expect(swSource).toContain('event.respondWith(cacheFirst(SHELL, request))')
  })
})
