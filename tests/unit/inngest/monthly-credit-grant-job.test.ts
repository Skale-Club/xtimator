import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * SEED-055 Phase C - monthlyCreditGrantJob (daily subscription-cycle cron).
 *
 * Contract under test (runMonthlyCreditGrant in lib/inngest/functions/monthly-credit-grant.ts):
 *   - getBillingConfig() read ONCE per run
 *   - SELECT companies WHERE tier IN ('pro','business') AND stripe_subscription_id IS NOT NULL
 *     AND status NULL/active/trialing AND tier_renews_at > now()
 *   - For each row: grantMonthlyLot({ companyId, credits: tiers[tier].monthlyCreditGrant,
 *     periodEnd: tier_renews_at })  - monthly sub and annual sub use the SAME call; the
 *     window math (billing period vs monthly anniversary) lives in credit-window.ts
 *   - free / unpaid (tier_renews_at <= now) companies are excluded BY THE QUERY
 *   - per-company resilience: one throw does not abort the loop
 *   - SELECT error -> THROWS (Inngest retries)
 *   - ops alert only when EVERY attempt FAILED; an already-granted no-op is not a failure
 *   - monthlyCreditGrantJob: id 'monthly-credit-grant', cron '0 5 * * *' (daily)
 *
 * The window arithmetic is covered by credit-window.test.ts; the no-double-grant
 * regression by credit-grant-no-double.test.ts. The end-to-end monthly vs annual
 * behaviour with the REAL window math is the last describe below.
 *
 * No real secrets - placeholder ids only (co_1, sub_test).
 */
const { mockGrantMonthlyLot, mockGetBillingConfig, mockNotifyOps } = vi.hoisted(() => ({
  mockGrantMonthlyLot: vi.fn(),
  mockGetBillingConfig: vi.fn(),
  mockNotifyOps: vi.fn(),
}))

vi.mock('@/lib/billing/credit-ledger', () => ({
  grantMonthlyLot: mockGrantMonthlyLot,
}))
vi.mock('@/lib/billing/billing-config', () => ({ getBillingConfig: mockGetBillingConfig }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: mockNotifyOps }))

import {
  runMonthlyCreditGrant,
  monthlyCreditGrantJob,
} from '@/lib/inngest/functions/monthly-credit-grant'

const TEST_CONFIG = {
  tiers: {
    free: { monthlyCreditGrant: 0 },
    pro: { monthlyCreditGrant: 9000 },
    business: { monthlyCreditGrant: 30000 },
  },
}

type Row = { id: string; tier: string; tier_renews_at: string | null }

/**
 * Chainable companies select fake:
 *   svc.from('companies').select('id, tier, tier_renews_at').in(...).not(...).or(...).gt(...)
 * `gt` is the terminal call.
 */
function makeSvc(opts: { rows: Row[] | null; selectError?: { message: string } | null }) {
  const chain: Record<string, unknown> = {}
  chain.in = vi.fn().mockReturnValue(chain)
  chain.not = vi.fn().mockReturnValue(chain)
  chain.or = vi.fn().mockReturnValue(chain)
  chain.gt = vi.fn().mockResolvedValue({ data: opts.rows, error: opts.selectError ?? null })
  const select = vi.fn().mockReturnValue(chain)
  return { from: vi.fn().mockReturnValue({ select }), __chain: chain, __select: select }
}

const FUTURE = new Date(Date.now() + 20 * 86_400_000).toISOString()

describe('runMonthlyCreditGrant (SEED-055 Phase C)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGrantMonthlyLot.mockResolvedValue({ applied: true })
    mockGetBillingConfig.mockResolvedValue(TEST_CONFIG)
    mockNotifyOps.mockResolvedValue(undefined)
  })

  it('grants each active paying company its tier grant via grantMonthlyLot(periodEnd = tier_renews_at)', async () => {
    const svc = makeSvc({
      rows: [
        { id: 'co_1', tier: 'pro', tier_renews_at: FUTURE },
        { id: 'co_2', tier: 'business', tier_renews_at: FUTURE },
      ],
    })

    const result = await runMonthlyCreditGrant(svc as never)

    expect(result).toEqual({ attempted: 2, granted: 2, failed: 0 })
    expect(svc.from).toHaveBeenCalledWith('companies')
    expect(svc.__select).toHaveBeenCalledWith('id, tier, tier_renews_at')
    expect(svc.__chain.in).toHaveBeenCalledWith('tier', ['pro', 'business'])
    expect(svc.__chain.not).toHaveBeenCalledWith('stripe_subscription_id', 'is', null)
    // Backward-compatible status filter - NULL (pre-column rows) OR active/trialing.
    expect(svc.__chain.or).toHaveBeenCalledWith(
      'stripe_subscription_status.is.null,stripe_subscription_status.in.(active,trialing)',
    )
    expect(mockGetBillingConfig).toHaveBeenCalledTimes(1)

    expect(mockGrantMonthlyLot).toHaveBeenCalledTimes(2)
    expect(mockGrantMonthlyLot).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'co_1', credits: 9000, periodEnd: new Date(FUTURE) }),
    )
    expect(mockGrantMonthlyLot).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'co_2', credits: 30000, periodEnd: new Date(FUTURE) }),
    )
  })

  it('only selects subscriptions PAID THROUGH a future date: tier_renews_at > now (an unpaid renewal never gets a free month)', async () => {
    const svc = makeSvc({ rows: [] })
    const before = Date.now()

    await runMonthlyCreditGrant(svc as never)

    expect(svc.__chain.gt).toHaveBeenCalledTimes(1)
    const [col, bound] = (svc.__chain.gt as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(col).toBe('tier_renews_at')
    const boundMs = new Date(bound as string).getTime()
    expect(boundMs).toBeGreaterThanOrEqual(before)
    expect(boundMs).toBeLessThanOrEqual(Date.now())
  })

  it('empty result set grants nothing and does not alert', async () => {
    const svc = makeSvc({ rows: [] })

    const result = await runMonthlyCreditGrant(svc as never)

    expect(result).toEqual({ attempted: 0, granted: 0, failed: 0 })
    expect(mockGrantMonthlyLot).not.toHaveBeenCalled()
    expect(mockNotifyOps).not.toHaveBeenCalled()
  })

  it('per-company resilience: one grantMonthlyLot throw does not abort the loop', async () => {
    const svc = makeSvc({
      rows: [
        { id: 'co_1', tier: 'pro', tier_renews_at: FUTURE },
        { id: 'co_2', tier: 'pro', tier_renews_at: FUTURE },
        { id: 'co_3', tier: 'pro', tier_renews_at: FUTURE },
      ],
    })
    mockGrantMonthlyLot
      .mockResolvedValueOnce({ applied: true })
      .mockRejectedValueOnce(new Error('grant boom'))
      .mockResolvedValueOnce({ applied: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await runMonthlyCreditGrant(svc as never)

    expect(result).toEqual({ attempted: 3, granted: 2, failed: 1 })
    expect(mockGrantMonthlyLot).toHaveBeenCalledTimes(3)
    warn.mockRestore()
  })

  it('an already-granted no-op (applied:false, not failed) is NOT a failure and does NOT alert', async () => {
    const svc = makeSvc({
      rows: [
        { id: 'co_1', tier: 'pro', tier_renews_at: FUTURE },
        { id: 'co_2', tier: 'pro', tier_renews_at: FUTURE },
      ],
    })
    mockGrantMonthlyLot.mockResolvedValue({ applied: false }) // every lot was already granted today's window

    const result = await runMonthlyCreditGrant(svc as never)

    expect(result).toEqual({ attempted: 2, granted: 0, failed: 0 })
    expect(mockNotifyOps).not.toHaveBeenCalled()
  })

  it('a partial failure (some applied, some failed) does not alert', async () => {
    const svc = makeSvc({
      rows: [
        { id: 'co_1', tier: 'pro', tier_renews_at: FUTURE },
        { id: 'co_2', tier: 'pro', tier_renews_at: FUTURE },
      ],
    })
    mockGrantMonthlyLot
      .mockResolvedValueOnce({ applied: true })
      .mockResolvedValueOnce({ applied: false, failed: true })

    const result = await runMonthlyCreditGrant(svc as never)

    expect(result).toEqual({ attempted: 2, granted: 1, failed: 1 })
    expect(mockNotifyOps).not.toHaveBeenCalled()
  })

  it('THROWS when the SELECT errors - lets Inngest retry instead of silently skipping the day', async () => {
    const svc = makeSvc({ rows: null, selectError: { message: 'rls denied' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(runMonthlyCreditGrant(svc as never)).rejects.toThrow(/rls denied/)

    expect(mockGrantMonthlyLot).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('fires notifyOps("monthly_credit_grant_zero_success") only when EVERY attempt failed', async () => {
    const svc = makeSvc({
      rows: [
        { id: 'co_1', tier: 'pro', tier_renews_at: FUTURE },
        { id: 'co_2', tier: 'business', tier_renews_at: FUTURE },
      ],
    })
    mockGrantMonthlyLot.mockResolvedValue({ applied: false, failed: true })

    const result = await runMonthlyCreditGrant(svc as never)

    expect(result).toEqual({ attempted: 2, granted: 0, failed: 2 })
    expect(mockNotifyOps).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'monthly_credit_grant_zero_success', severity: 'error' }),
    )
  })
})

describe('monthly vs annual vs lapsed - the cron through the REAL window math', () => {
  // A second module graph with the REAL grantMonthlyLot and an RPC recorder, so
  // the arguments the RPC receives prove which window each sub type gets.
  async function runWithRealGrant(rows: Row[], now: Date) {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const rpc = vi.fn().mockResolvedValue({
      data: [{ balance_after: 0, applied: true, lot_id: 'lot_1' }],
      error: null,
    })
    vi.doMock('@/lib/supabase/service', () => ({ requireServiceClient: () => ({ rpc }) }))
    vi.doMock('@/lib/billing/billing-config', () => ({ getBillingConfig: mockGetBillingConfig }))
    vi.doMock('@/lib/observability/ops-alert', () => ({ notifyOps: mockNotifyOps }))
    vi.doMock('@/lib/notifications/dispatch', () => ({ notify: vi.fn() }))
    vi.doMock('@/lib/notifications/copy', () => ({ buildNotificationCopy: vi.fn() }))
    vi.doMock('@/lib/billing/auto-topup', () => ({ triggerAutoTopupIfNeeded: vi.fn() }))
    vi.doUnmock('@/lib/billing/credit-ledger')
    const mod = await import('@/lib/inngest/functions/monthly-credit-grant')
    const svc = makeSvc({ rows })
    const result = await mod.runMonthlyCreditGrant(svc as never)
    vi.useRealTimers()
    return { result, rpc }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetBillingConfig.mockResolvedValue(TEST_CONFIG)
  })

  it('monthly sub (paid through Jul 15): the lot is the billing period Jun 15 - Jul 15', async () => {
    const { rpc } = await runWithRealGrant(
      [{ id: 'co_m', tier: 'pro', tier_renews_at: '2026-07-15T00:00:00.000Z' }],
      new Date('2026-06-20T05:00:00Z'),
    )
    expect(rpc).toHaveBeenCalledWith(
      'grant_monthly_lot',
      expect.objectContaining({
        p_company_id: 'co_m',
        p_credits: 9000,
        p_period_key: '2026-06-15',
        p_expires_at: '2026-07-15T00:00:00.000Z',
        p_idempotency_key: 'grant:co_m:2026-06-15',
      }),
    )
  })

  it('annual sub (paid through next March): the lot is the CURRENT monthly anniversary, not the year', async () => {
    const { rpc } = await runWithRealGrant(
      [{ id: 'co_a', tier: 'pro', tier_renews_at: '2027-03-15T00:00:00.000Z' }],
      new Date('2026-08-20T05:00:00Z'),
    )
    expect(rpc).toHaveBeenCalledWith(
      'grant_monthly_lot',
      expect.objectContaining({
        p_company_id: 'co_a',
        p_period_key: '2026-08-15',
        p_expires_at: '2026-09-15T00:00:00.000Z',
        p_idempotency_key: 'grant:co_a:2026-08-15',
      }),
    )
  })

  it('annual sub: the next day inside the same window produces the SAME key (idempotent)', async () => {
    const row: Row = { id: 'co_a', tier: 'pro', tier_renews_at: '2027-03-15T00:00:00.000Z' }
    const day1 = await runWithRealGrant([row], new Date('2026-08-20T05:00:00Z'))
    const day2 = await runWithRealGrant([row], new Date('2026-08-21T05:00:00Z'))
    expect(day1.rpc.mock.calls[0][1].p_idempotency_key).toBe(day2.rpc.mock.calls[0][1].p_idempotency_key)
  })

  it('tier_renews_at <= now (lapsed / unpaid period) never reaches the RPC even if the query returned it', async () => {
    const { rpc, result } = await runWithRealGrant(
      [{ id: 'co_u', tier: 'pro', tier_renews_at: '2026-06-01T00:00:00.000Z' }],
      new Date('2026-06-20T05:00:00Z'),
    )
    expect(rpc).not.toHaveBeenCalled()
    expect(result).toEqual({ attempted: 1, granted: 0, failed: 0 })
  })
})

describe('monthlyCreditGrantJob (Inngest function config)', () => {
  type FnInternals = {
    opts: {
      id: string
      retries?: number
      triggers?: Array<{ cron?: string; event?: string }>
    }
  }

  it('is created with id "monthly-credit-grant" and a DAILY cron "0 5 * * *"', () => {
    const fn = monthlyCreditGrantJob as unknown as FnInternals
    expect(fn.opts.id).toBe('monthly-credit-grant')
    expect(fn.opts.triggers).toContainEqual({ cron: '0 5 * * *' })
    expect(fn.opts.triggers).not.toContainEqual({ cron: '0 5 1 * *' })
  })

  it('is configured with retries: 3', () => {
    const fn = monthlyCreditGrantJob as unknown as FnInternals
    expect(fn.opts.retries).toBe(3)
  })

  it('function body wraps the grant in step.run("grant-monthly-credits", ...)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/monthly-credit-grant.ts'),
      'utf8',
    )
    expect(src).toMatch(/step\.run\(['"]grant-monthly-credits['"]/)
  })

  it('no longer references the calendar-month key', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/monthly-credit-grant.ts'),
      'utf8',
    )
    expect(src).not.toMatch(/monthGrantKey/)
  })
})

describe('monthlyCreditGrantJob is registered in serve()', () => {
  it('app/api/inngest/route.ts imports monthlyCreditGrantJob and includes it in the functions array', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/api/inngest/route.ts'), 'utf8')
    expect(src).toMatch(/monthlyCreditGrantJob/)
  })
})
