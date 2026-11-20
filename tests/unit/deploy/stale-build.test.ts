import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  isReloadingForNewBuild,
  newerBuildIsLive,
  recoverFromStaleBuild,
  stashDraft,
  takeDraft,
} from '@/lib/deploy/stale-build'

const health = (commit: string) =>
  vi.fn(async () => new Response(JSON.stringify({ ok: true, commit }), { status: 200 })) as unknown as typeof fetch

beforeEach(() => {
  window.sessionStorage.clear()
  vi.stubEnv('NEXT_DEPLOYMENT_ID', 'build-old')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('newerBuildIsLive', () => {
  it('is true only when /api/health reports another commit', async () => {
    expect(await newerBuildIsLive(health('build-new'))).toBe(true)
    expect(await newerBuildIsLive(health('build-old'))).toBe(false)
  })

  it('is false without a build id or when health fails', async () => {
    vi.stubEnv('NEXT_DEPLOYMENT_ID', '')
    expect(await newerBuildIsLive(health('build-new'))).toBe(false)
    vi.stubEnv('NEXT_DEPLOYMENT_ID', 'build-old')
    const failing = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await newerBuildIsLive(failing)).toBe(false)
  })
})

describe('stashDraft / takeDraft', () => {
  it('returns the draft once, only for the server copy it was based on', () => {
    stashDraft('estimate:e1', '2026-11-20T03:00:00Z', { total: 10 })
    expect(takeDraft('estimate:e1', '2026-11-20T03:05:00Z')).toBeNull() // someone saved since
    stashDraft('estimate:e1', '2026-11-20T03:00:00Z', { total: 10 })
    expect(takeDraft('estimate:e1', '2026-11-20T03:00:00Z')).toEqual({ total: 10 })
    expect(takeDraft('estimate:e1', '2026-11-20T03:00:00Z')).toBeNull() // consumed
  })

  it('ignores a draft older than an hour', () => {
    vi.useFakeTimers()
    stashDraft('change-order:c1', 'v1', { title: 'x' })
    vi.advanceTimersByTime(61 * 60 * 1000)
    expect(takeDraft('change-order:c1', 'v1')).toBeNull()
    vi.useRealTimers()
  })
})

describe('recoverFromStaleBuild', () => {
  it('stashes and reloads when a newer build is live', async () => {
    const reload = vi.fn()
    const ok = await recoverFromStaleBuild('estimate:e2', 'v1', { a: 1 }, { reload, fetchImpl: health('build-new') })
    expect(ok).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
    expect(isReloadingForNewBuild()).toBe(true)
    expect(takeDraft('estimate:e2', 'v1')).toEqual({ a: 1 })
  })

  it('does nothing when the page already runs the live build', async () => {
    const reload = vi.fn()
    const ok = await recoverFromStaleBuild('estimate:e3', 'v1', { a: 1 }, { reload, fetchImpl: health('build-old') })
    expect(ok).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(takeDraft('estimate:e3', 'v1')).toBeNull()
  })
})
