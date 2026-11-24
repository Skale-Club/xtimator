import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BillingBlockedError } from '@/lib/billing/access-guard'

/**
 * Credits plan 2026-11-20 - continueOrPauseForCredits: a run checks credits
 * before a step; with none it journals a pause, tells the owner, waits for
 * billing/credits.granted for its company, re-checks, and resumes - or
 * expires after creditPauseDays.
 */

const canContinueRun = vi.fn()
vi.mock('@/lib/billing/access-state', () => ({ canContinueRun: (...a: unknown[]) => canContinueRun(...a) }))
vi.mock('@/lib/billing/billing-config', () => ({ getBillingConfig: vi.fn(async () => ({ creditPauseDays: 7 })) }))
const recordPipelineEvent = vi.fn(async () => undefined)
vi.mock('@/lib/observability/pipeline-events', () => ({ recordPipelineEvent: (...a: unknown[]) => recordPipelineEvent(...a) }))
const notify = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/notifications/dispatch', () => ({ notify: (...a: unknown[]) => notify(...a) }))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === 'projects'
              ? { data: { name: 'Cozinha Silva' } }
              : { data: { tier: 'pro', stripe_subscription_status: 'active', stripe_subscription_id: 'sub_1' } },
        }),
      }),
    }),
  }),
}))

const triggerAutoTopupIfNeeded = vi.fn(async () => undefined)
vi.mock('@/lib/billing/auto-topup', () => ({ triggerAutoTopupIfNeeded: (...a: unknown[]) => triggerAutoTopupIfNeeded(...a) }))

const { continueOrPauseForCredits, AWAITING_CREDITS, CREDIT_PAUSE_EXPIRED } = await import('@/lib/inngest/credit-pause')

const CTX = {
  companyId: 'co-1',
  projectId: 'p-1',
  attemptId: 'att-1',
  inputType: 'recording' as const,
  ownerUserId: 'u-1',
  next: 'generate_estimate' as const,
}

/**
 * A fake Inngest step: runs steps inline; waitForEvent answers from a queue
 * (an event) or, when the queue is empty, times out. The system clock is faked
 * and advances by the wait's timeout on a timeout (and a minute on an event),
 * so a run that never gets credits reaches its deadline.
 */
function fakeStep(waits: Array<unknown | null>) {
  const ids: string[] = []
  const waitOpts: Array<{ event: string; timeout: string; if?: string }> = []
  return {
    ids,
    waitOpts,
    step: {
      run: async <T,>(id: string, fn: () => Promise<T>) => {
        ids.push(id)
        return fn()
      },
      waitForEvent: async (id: string, opts: { event: string; timeout: string; if?: string }) => {
        ids.push(id)
        waitOpts.push(opts)
        if (waits.length) {
          vi.setSystemTime(Date.now() + 60_000)
          return waits.shift()!
        }
        vi.setSystemTime(Date.now() + Number(opts.timeout.replace('m', '')) * 60_000)
        return null
      },
    },
  }
}

const journal = () => recordPipelineEvent.mock.calls.map((c) => c[0] as Record<string, unknown>)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('continueOrPauseForCredits', () => {
  it('with credits: continues at once, journals nothing, waits for nothing', async () => {
    canContinueRun.mockResolvedValue({ ok: true })
    const { step, ids } = fakeStep([])
    expect(await continueOrPauseForCredits(step, CTX)).toBe('continue')
    expect(ids).toEqual(['credits-check-generate_estimate'])
    expect(recordPipelineEvent).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('without credits: journals a pause (started + awaiting_credits) with its expiry and next step, and tells the owner', async () => {
    canContinueRun.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true })
    const { step } = fakeStep([{ data: { companyId: 'co-1' } }])
    await continueOrPauseForCredits(step, CTX)
    const pause = journal()[0]
    expect(pause).toMatchObject({
      attemptId: 'att-1',
      step: 'generate_estimate',
      status: 'started',
      errorCode: AWAITING_CREDITS,
    })
    const meta = pause.metadata as { next: string; expiresAt: string }
    expect(meta.next).toBe('generate_estimate')
    const days = (Date.parse(meta.expiresAt) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co-1',
        linkUrl: '/projects/p-1?paused=att-1',
        title: 'Your estimate for "Cozinha Silva" is paused',
        channels: { inApp: true, email: true },
      })
    )
    expect((notify.mock.calls[0][0] as { body: string }).body).toContain('Buy credits')
  })

  it('waits only for this company\'s credits.granted event, within the pause window', async () => {
    canContinueRun.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true })
    const { step, waitOpts } = fakeStep([{ data: { companyId: 'co-1' } }])
    await continueOrPauseForCredits(step, CTX)
    expect(waitOpts[0].event).toBe('billing/credits.granted')
    expect(waitOpts[0].if).toBe('async.data.companyId == "co-1"')
    // A bounded wait (one hour while the pause is young), never one 7-day wait.
    expect(waitOpts[0].timeout).toBe('60m')
  })

  it('a top-up that landed while no wait was registered is found when the wait times out', async () => {
    canContinueRun
      .mockResolvedValueOnce({ ok: false }) // first check
      .mockResolvedValueOnce({ ok: false }) // after the auto top-up attempt
      .mockResolvedValueOnce({ ok: true }) // re-check after the first timeout
    const { step, waitOpts } = fakeStep([]) // no event ever arrives
    expect(await continueOrPauseForCredits(step, CTX)).toBe('continue')
    expect(waitOpts).toHaveLength(1)
    expect(journal().at(-1)).toMatchObject({ status: 'started', metadata: { resumed: true } })
  })

  it('keeps polling on timeouts until credits show up, with bounded waits and unique step ids', async () => {
    canContinueRun.mockResolvedValue({ ok: false })
    // Credits appear on the 5th re-check (after four empty timeouts).
    canContinueRun
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
    const { step, waitOpts, ids } = fakeStep([])
    expect(await continueOrPauseForCredits(step, CTX)).toBe('continue')
    expect(waitOpts).toHaveLength(5)
    for (const o of waitOpts) expect(o.timeout).toBe('60m')
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('credits-wait-generate_estimate-4')
    expect(ids).toContain('credits-recheck-generate_estimate-4')
  })

  it('polls hourly for the first day, then every six hours, until the 7-day expiry (bounded step count)', async () => {
    canContinueRun.mockResolvedValue({ ok: false })
    const { step, waitOpts } = fakeStep([])
    expect(await continueOrPauseForCredits(step, CTX)).toBe('expired')
    const minutes = waitOpts.map((o) => Number(o.timeout.replace('m', '')))
    expect(Math.max(...minutes)).toBeLessThanOrEqual(360)
    expect(minutes.slice(0, 24).every((m) => m === 60)).toBe(true)
    expect(minutes.length).toBeLessThan(60)
    expect(minutes.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(7 * 24 * 60 - 360)
  })

  it('credits arrive: re-checks, journals a plain started row (resumed) and continues', async () => {
    canContinueRun.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true })
    const { step } = fakeStep([{ data: { companyId: 'co-1' } }])
    expect(await continueOrPauseForCredits(step, CTX)).toBe('continue')
    const resumed = journal()[1]
    expect(resumed).toMatchObject({ status: 'started', step: 'generate_estimate' })
    expect(resumed.errorCode).toBeUndefined()
    expect(resumed.metadata).toMatchObject({ resumed: true })
  })

  it('a grant that only paid down debt leaves the balance empty: keeps waiting, then resumes on the next one', async () => {
    canContinueRun
      .mockResolvedValueOnce({ ok: false }) // first check
      .mockResolvedValueOnce({ ok: false }) // after the auto top-up attempt
      .mockResolvedValueOnce({ ok: false }) // after grant 1 (paid debt only)
      .mockResolvedValue({ ok: true }) // after grant 2
    const { step, waitOpts } = fakeStep([{ data: {} }, { data: {} }])
    expect(await continueOrPauseForCredits(step, CTX)).toBe('continue')
    expect(waitOpts).toHaveLength(2)
    expect(journal().filter((r) => r.errorCode === AWAITING_CREDITS)).toHaveLength(1)
  })

  it('a run paused before the polling loop shipped replays its old boolean recheck without breaking', async () => {
    canContinueRun.mockResolvedValue({ ok: false })
    const { step, waitOpts } = fakeStep([])
    const run = step.run
    // Old code memoized `credits-recheck-<next>-0` as a bare boolean.
    step.run = (async (id: string, fn: () => Promise<unknown>) =>
      id === 'credits-recheck-generate_estimate-0' ? false : run(id, fn)) as typeof step.run
    expect(await continueOrPauseForCredits(step, CTX)).toBe('expired')
    const minutes = waitOpts.map((o) => Number(o.timeout.replace('m', '')))
    expect(minutes.every((m) => Number.isFinite(m) && m > 0)).toBe(true)
    expect(minutes.length).toBeLessThan(60)
  })

  it('no credits within the window: journals the expiry (failed + credit_pause_expired) and stops', async () => {
    canContinueRun.mockResolvedValue({ ok: false })
    const { step } = fakeStep([null])
    expect(await continueOrPauseForCredits(step, CTX)).toBe('expired')
    const last = journal().at(-1)!
    expect(last).toMatchObject({ status: 'failed', errorCode: CREDIT_PAUSE_EXPIRED })
  })

  it('step ids are unique per wake, so Inngest memoizes each wait separately', async () => {
    canContinueRun.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true })
    const { step, ids } = fakeStep([{}, {}])
    await continueOrPauseForCredits(step, { ...CTX, next: 'analyze' })
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('credits-pause-analyze')
    expect(ids).toContain('credits-wait-analyze-0')
    expect(ids).toContain('credits-wait-analyze-1')
  })

  it.each(['analyze', 'generate_estimate'] as const)(
    'a balance read error stops %s before charging or notifying',
    async (next) => {
      canContinueRun.mockRejectedValue(new Error('db down'))
      const { step, ids, waitOpts } = fakeStep([])
      const result = continueOrPauseForCredits(step, { ...CTX, next })

      await expect(result).rejects.toBeInstanceOf(BillingBlockedError)
      await expect(result).rejects.toMatchObject({ code: 'unavailable' })
      expect(ids).toEqual([`credits-check-${next}`])
      expect(waitOpts).toEqual([])
      expect(triggerAutoTopupIfNeeded).not.toHaveBeenCalled()
      expect(recordPipelineEvent).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()
    },
  )

  it('a notify failure never breaks the pause', async () => {
    canContinueRun.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true })
    notify.mockRejectedValueOnce(new Error('smtp down'))
    const { step } = fakeStep([{}])
    expect(await continueOrPauseForCredits(step, CTX)).toBe('continue')
  })

  it('delivery 3: auto top-up is tried before pausing; when it recharges, the run continues without a pause', async () => {
    canContinueRun.mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true })
    const { step, ids } = fakeStep([])
    expect(await continueOrPauseForCredits(step, CTX)).toBe('continue')
    expect(triggerAutoTopupIfNeeded).toHaveBeenCalledWith({ companyId: 'co-1', newBalance: 0 })
    expect(ids).toContain('credits-autotopup-generate_estimate')
    expect(recordPipelineEvent).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('delivery 3: a failed or skipped auto top-up still pauses normally', async () => {
    triggerAutoTopupIfNeeded.mockRejectedValueOnce(new Error('card declined'))
    canContinueRun.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true })
    const { step } = fakeStep([{}])
    expect(await continueOrPauseForCredits(step, CTX)).toBe('continue')
    expect(journal()[0]).toMatchObject({ errorCode: AWAITING_CREDITS })
  })
})
