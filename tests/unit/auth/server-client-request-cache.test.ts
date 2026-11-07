// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { scope, makeOwned, makeLegacy } = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const scope = new AsyncLocalStorage<{
    identity: string
    owned: boolean
    cache: Map<unknown, unknown>
  }>()
  return {
    scope,
    makeOwned: vi.fn(async () => ({ identity: scope.getStore()!.identity })),
    makeLegacy: vi.fn(() => ({ identity: scope.getStore()!.identity })),
  }
})

// Supply React's per-render cache boundary in this Node unit test. Concurrent
// AsyncLocalStorage contexts represent independent server requests; auth/token
// validation itself is covered by owned-client.test.ts with the real client.
vi.mock('react', () => ({
  cache: <T>(load: () => T) => () => {
    const request = scope.getStore()!
    if (!request.cache.has(load)) request.cache.set(load, load())
    return request.cache.get(load) as T
  },
}))
vi.mock('@/lib/auth/mode', () => ({ ownedAuthEnabled: () => scope.getStore()!.owned }))
vi.mock('@/lib/auth/owned-client', () => ({ createOwnedClient: makeOwned }))
vi.mock('@supabase/ssr', () => ({ createServerClient: makeLegacy }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))

import { createClient } from '@/lib/supabase/server'
import '@/lib/auth/owned-client'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://data.example.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network access in request-cache test') }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe.each([true, false])('server data client (owned=%s)', (owned) => {
  it('shares a single client across concurrent consumers in one request', async () => {
    const [first, second] = await scope.run(
      { identity: 'user-one', owned, cache: new Map() },
      () => Promise.all([createClient(), createClient()]),
    )
    expect(first).toBe(second)
    expect(first).toEqual({ identity: 'user-one' })
  })

  it('never retains credentials for subsequent requests', async () => {
    const first = await scope.run({ identity: 'user-one', owned, cache: new Map() }, () => createClient())
    const second = await scope.run({ identity: 'user-two', owned, cache: new Map() }, () => createClient())
    expect(first).not.toBe(second)
    expect(first).toEqual({ identity: 'user-one' })
    expect(second).toEqual({ identity: 'user-two' })
  })
})
