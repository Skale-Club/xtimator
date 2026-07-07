import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const swSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

describe('PWA service worker caching contract', () => {
  it('is an emergency no-fetch cleanup worker', () => {
    expect(swSource).toContain('cleanupServiceWorker')
    expect(swSource).toContain('self.registration.unregister()')
    expect(swSource).not.toContain("self.addEventListener('fetch'")
    expect(swSource).not.toContain('event.respondWith')
  })

  it('only deletes service-worker-owned caches during cleanup', () => {
    expect(swSource).toContain("const CACHE_PREFIXES = ['shell-', 'pages-']")
    expect(swSource).toContain('CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))')
    expect(swSource).not.toContain("keys.filter((k) => !KNOWN_CACHES.includes(k))")
  })
})
