import { describe, it, expect } from 'vitest'
import { isPushWorkerRegistration } from '@/lib/pwa/push-worker'

/**
 * 260928: the app's emergency cleanup unregisters every service worker on
 * load. It must spare the push-only worker, or push would die on reload.
 */
describe('isPushWorkerRegistration', () => {
  it('recognizes the push worker by its scope or its script', () => {
    expect(isPushWorkerRegistration({ scope: 'https://xtimator.com/push/' })).toBe(true)
    expect(
      isPushWorkerRegistration({ scope: 'https://xtimator.com/other/', waiting: { scriptURL: 'https://xtimator.com/push-sw.js' } })
    ).toBe(true)
  })

  it('does not spare the legacy caching worker', () => {
    expect(isPushWorkerRegistration({ scope: 'https://xtimator.com/', active: { scriptURL: 'https://xtimator.com/sw.js' } })).toBe(false)
  })
})
