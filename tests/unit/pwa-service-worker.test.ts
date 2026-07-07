import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const swSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

describe('PWA service worker caching contract', () => {
  it('serves navigations with a network-first strategy to avoid stale Next.js HTML', () => {
    expect(swSource).toContain("const CACHE_V = 'v5'")
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

  it('does not intercept Next.js static chunks', () => {
    expect(swSource).toContain("url.pathname.startsWith('/_next/static/')")
    expect(swSource).toContain("if (url.pathname.startsWith('/_next/static/')) return")
  })

  it('does not intercept images or installable app icons', () => {
    const nextStaticReturn = swSource.indexOf("if (url.pathname.startsWith('/_next/static/')) return")
    const imageReturn = swSource.indexOf("if (request.destination === 'image' || url.pathname.startsWith('/icons/')) return")

    expect(nextStaticReturn).toBeGreaterThan(-1)
    expect(imageReturn).toBeGreaterThan(-1)
    expect(imageReturn).toBeLessThan(nextStaticReturn)
  })

  it('only deletes service-worker-owned caches on activation', () => {
    expect(swSource).toContain("k.startsWith('shell-') || k.startsWith('pages-')")
    expect(swSource).toContain('!KNOWN_CACHES.includes(k)')
    expect(swSource).not.toContain("keys.filter((k) => !KNOWN_CACHES.includes(k))")
  })
})
