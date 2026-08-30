import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * lib/observability/error-spike.ts — layer 3 of the alerting design.
 *
 * ONE alert per error RATE, never per error. A broken endpoint emits hundreds
 * of errors a minute; a channel that floods is a channel that gets muted, which
 * costs you the alerts that matter. These tests pin the properties that make
 * that true, because they are exactly the ones a well-meaning refactor breaks:
 *
 *  - below threshold      → silent (the background error rate must not page)
 *  - at threshold         → exactly ONE notifyOps call, kind 'error_spike'
 *  - sustained outage     → still ONE alert, not one per error (cooldown holds)
 *  - after the cooldown   → speaks again (a worsening incident is not muted forever)
 *  - window rolls         → errors spread thinly across time never accumulate
 *  - top codes named      → the message says WHAT broke, not merely that something did
 *  - self-referential     → the notifier's own failures cannot feed the counter
 *  - never throws         → it runs on the error path of every failing request
 *
 * notifyOps is mocked: no Sentry, Redis, Telegram or DB is touched.
 */

const notifyOpsMock = vi.fn()
vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: (...args: unknown[]) => notifyOpsMock(...args),
}))

import {
  recordServerError,
  getErrorSpikeState,
  __resetErrorSpikeStateForTests,
} from '@/lib/observability/error-spike'

/**
 * The alert is dispatched through a lazy `import('@/lib/observability/ops-alert')`
 * (see that module's docblock — a static import dragged the whole server graph
 * into every consumer of lib/errors and broke three unrelated suites). That
 * makes delivery land in a microtask, so assertions must flush first.
 */
const flushAlerts = async () => {
  // Several ticks, not one. The FIRST dispatch pays for resolving the module
  // (several microtasks); later ones hit the module cache and settle sooner, so
  // a single tick can land the second alert while the first is still pending —
  // which reads as an off-by-one in the assertion rather than as a flush bug.
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

const THRESHOLD = 10
const WINDOW_MS = 5 * 60_000
const COOLDOWN_MS = 30 * 60_000
const T0 = 1_700_000_000_000

beforeEach(() => {
  notifyOpsMock.mockReset()
  notifyOpsMock.mockResolvedValue(undefined)
  __resetErrorSpikeStateForTests()
})

describe('recordServerError — rate, not volume', () => {
  it('stays silent below the threshold', async () => {
    for (let i = 0; i < THRESHOLD - 1; i++) {
      recordServerError('internal:estimates', T0 + i * 100)
    }
    await flushAlerts()
    expect(notifyOpsMock).not.toHaveBeenCalled()
    expect(getErrorSpikeState().windowCount).toBe(THRESHOLD - 1)
  })

  it('fires exactly once when the threshold is crossed', async () => {
    for (let i = 0; i < THRESHOLD; i++) {
      recordServerError('internal:estimates', T0 + i * 100)
    }
    await flushAlerts()
    expect(notifyOpsMock).toHaveBeenCalledTimes(1)
    const alert = notifyOpsMock.mock.calls[0][0]
    expect(alert.kind).toBe('error_spike')
    expect(alert.severity).toBe('error')
    expect(alert.title).toContain(String(THRESHOLD))
  })

  it('names the error codes responsible, most frequent first', async () => {
    for (let i = 0; i < 7; i++) recordServerError('internal:estimates', T0 + i)
    for (let i = 0; i < 3; i++) recordServerError('offline:whatsapp', T0 + 10 + i)

    await flushAlerts()
    expect(notifyOpsMock).toHaveBeenCalledTimes(1)
    const { message } = notifyOpsMock.mock.calls[0][0]
    expect(message).toContain('internal:estimates ×7')
    expect(message).toContain('offline:whatsapp ×3')
    // Most frequent first — the reader should not have to sort it themselves.
    expect(message.indexOf('internal:estimates')).toBeLessThan(
      message.indexOf('offline:whatsapp')
    )
  })

  /**
   * The property that matters most. A real outage keeps producing errors for
   * far longer than one window; without the cooldown this would send a message
   * every five minutes for the whole incident.
   */
  it('sends ONE alert per cooldown during a sustained outage, not one per error', async () => {
    // 200 errors over 50 minutes of wall-clock — i.e. ten 5-minute windows,
    // every one of them far over threshold.
    const errors = THRESHOLD * 20
    const stepMs = 15_000
    for (let i = 0; i < errors; i++) {
      recordServerError('internal:unknown', T0 + i * stepMs)
    }

    // Without a cooldown this would be ~10 alerts (one per over-threshold
    // window) and, without windowing at all, 191. The contract is that the
    // count is bounded by ELAPSED TIME / COOLDOWN, not by error volume:
    // 50 min of outage across a 30 min cooldown = 2.
    const elapsedMs = (errors - 1) * stepMs
    const expected = Math.floor(elapsedMs / COOLDOWN_MS) + 1
    expect(expected).toBe(2)
    await flushAlerts()
    expect(notifyOpsMock).toHaveBeenCalledTimes(expected)
  })

  it('stays at exactly one alert while the outage is still inside the cooldown', async () => {
    // 100 errors over 25 minutes — many over-threshold windows, one cooldown.
    for (let i = 0; i < THRESHOLD * 10; i++) {
      recordServerError('internal:unknown', T0 + i * 15_000)
    }
    await flushAlerts()
    expect(notifyOpsMock).toHaveBeenCalledTimes(1)
  })

  it('speaks again once the cooldown has elapsed', async () => {
    for (let i = 0; i < THRESHOLD; i++) recordServerError('internal:unknown', T0 + i)
    await flushAlerts()
    expect(notifyOpsMock).toHaveBeenCalledTimes(1)

    const after = T0 + COOLDOWN_MS + 1_000
    for (let i = 0; i < THRESHOLD; i++) recordServerError('internal:unknown', after + i)
    await flushAlerts()
    expect(notifyOpsMock).toHaveBeenCalledTimes(2)
  })

  it('rolls the window so a thin trickle never accumulates into an alert', async () => {
    // One error per window, for many windows: never a spike.
    for (let i = 0; i < THRESHOLD * 3; i++) {
      recordServerError('internal:estimates', T0 + i * (WINDOW_MS + 1_000))
    }
    await flushAlerts()
    expect(notifyOpsMock).not.toHaveBeenCalled()
  })

  it('resets the counter after firing so the next window measures fresh', async () => {
    for (let i = 0; i < THRESHOLD; i++) recordServerError('internal:unknown', T0 + i)
    expect(getErrorSpikeState().windowCount).toBe(0)
  })
})

describe('recordServerError — cannot feed on itself', () => {
  it('ignores errors raised on the notifier’s own surfaces', async () => {
    for (let i = 0; i < THRESHOLD * 2; i++) {
      recordServerError('internal:notifications', T0 + i)
      recordServerError('internal:observability', T0 + i)
    }
    await flushAlerts()
    expect(notifyOpsMock).not.toHaveBeenCalled()
    expect(getErrorSpikeState().windowCount).toBe(0)
  })
})

describe('recordServerError — never throws', () => {
  it('swallows a notifyOps that throws synchronously', async () => {
    notifyOpsMock.mockImplementation(() => {
      throw new Error('telegram exploded')
    })
    expect(() => {
      for (let i = 0; i < THRESHOLD; i++) recordServerError('internal:unknown', T0 + i)
    }).not.toThrow()
    // The throw now surfaces inside the lazy import's .then(), so let the
    // resulting rejection settle and be swallowed by .catch().
    await flushAlerts()
  })

  it('swallows a notifyOps that rejects', async () => {
    notifyOpsMock.mockRejectedValue(new Error('nope'))
    expect(() => {
      for (let i = 0; i < THRESHOLD; i++) recordServerError('internal:unknown', T0 + i)
    }).not.toThrow()
    // Let the rejected fire-and-forget promise settle without an unhandled rejection.
    await flushAlerts()
  })
})
