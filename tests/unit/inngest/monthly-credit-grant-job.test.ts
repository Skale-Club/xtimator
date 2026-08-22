import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Phase 142 (ANN-02) — monthlyCreditGrantJob monthly cron tests.
 *
 * Mirrors cleanup-audio-job.test.ts (Quick task 260522-kf2).
 *
 * Contract under test (runMonthlyCreditGrant in lib/inngest/functions/monthly-credit-grant.ts):
 *   - getBillingConfig() read ONCE per run
 *   - SELECT companies WHERE tier IN ('pro','business') AND stripe_subscription_id IS NOT NULL
 *   - For each row, grantCredits({ companyId, credits: cfg.tiers[tier].monthlyCreditGrant,
 *       reason:'grant', refId:null, idempotencyKey: monthGrantKey(id, now) })
 *   - free/trial/no-subscription companies are excluded BY THE QUERY (never reach grantCredits)
 *   - per-company resilience: one grantCredits throw does not abort the loop
 *   - SELECT error → returns { granted: 0 }, never throws
 *   - monthlyCreditGrantJob: id 'monthly-credit-grant', cron '0 5 1 * *',
 *     body wrapped in step.run('grant-monthly-credits', ...)
 *   - app/api/inngest/route.ts registers monthlyCreditGrantJob in the serve() functions array
 *
 * The load-bearing no-double-grant regression lives in
 * tests/unit/billing/credit-grant-no-double.test.ts.
 *
 * No real secrets — placeholder ids only (co_1, sub_test).
 */

// grantCredits is mocked (the contract); monthGrantKey is kept REAL so the
// cron produces a genuine `grant:{companyId}:{YYYY-MM}` key.
// vi.hoisted so the fns exist before the hoisted vi.mock factories run.
const { mockGrantCredits, mockGetBillingConfig } = vi.hoisted(() => ({
  mockGrantCredits: vi.fn(),
  mockGetBillingConfig: vi.fn(),
}))

vi.mock('@/lib/billing/credit-ledger', () => ({
  grantCredits: mockGrantCredits,
  monthGrantKey: (companyId: string, date: Date = new Date()) =>
    `grant:${companyId}:${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
}))

vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: mockGetBillingConfig,
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import {
  runMonthlyCreditGrant,
  monthlyCreditGrantJob,
} from '@/lib/inngest/functions/monthly-credit-grant'

const TEST_CONFIG = {
  tiers: {
    free: { monthlyCreditGrant: 0 },
    trial: { monthlyCreditGrant: 2000 },
    pro: { monthlyCreditGrant: 9000 },
    business: { monthlyCreditGrant: 30000 },
  },
}

/**
 * Chainable companies select fake:
 *   svc.from('companies').select('id, tier').in('tier', [...])
 *     .not('stripe_subscription_id','is',null)
 *     .or('stripe_subscription_status.is.null,stripe_subscription_status.in.(active,trialing)')
 * resolves to { data: rows, error }.
 */
function makeSvc(opts: {
  rows: Array<{ id: string; tier: string }> | null
  selectError?: { message: string } | null
}) {
  const chain: Record<string, unknown> = {}
  chain.in = vi.fn().mockReturnValue(chain)
  chain.not = vi.fn().mockReturnValue(chain)
  chain.or = vi.fn().mockResolvedValue({
    data: opts.rows,
    error: opts.selectError ?? null,
  })
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(chain),
    }),
    __chain: chain,
  }
}

describe('runMonthlyCreditGrant (Phase 142 ANN-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGrantCredits.mockResolvedValue(undefined)
    mockGetBillingConfig.mockResolvedValue(TEST_CONFIG)
  })

  it('grants each active paying company its tier grant via grantCredits keyed on the company-month key', async () => {
    const rows = [
      { id: 'co_1', tier: 'pro' },
      { id: 'co_2', tier: 'business' },
    ]
    const svc = makeSvc({ rows })

    const result = await runMonthlyCreditGrant(svc as never)

    expect(result).toEqual({ granted: 2 })
    expect(svc.from).toHaveBeenCalledWith('companies')
    // Query selects active paying companies only.
    expect(svc.__chain.in).toHaveBeenCalledWith('tier', ['pro', 'business'])
    expect(svc.__chain.not).toHaveBeenCalledWith(
      'stripe_subscription_id',
      'is',
      null,
    )
    // Backward-compatible status filter — NULL (pre-column rows) OR active/trialing.
    expect(svc.__chain.or).toHaveBeenCalledWith(
      'stripe_subscription_status.is.null,stripe_subscription_status.in.(active,trialing)',
    )
    // getBillingConfig read ONCE (not per company).
    expect(mockGetBillingConfig).toHaveBeenCalledTimes(1)

    expect(mockGrantCredits).toHaveBeenCalledTimes(2)
    expect(mockGrantCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co_1',
        credits: 9000,
        reason: 'grant',
        refId: null,
        idempotencyKey: expect.stringMatching(/^grant:co_1:\d{4}-\d{2}$/),
      }),
    )
    expect(mockGrantCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co_2',
        credits: 30000,
        reason: 'grant',
        idempotencyKey: expect.stringMatching(/^grant:co_2:\d{4}-\d{2}$/),
      }),
    )
  })

  it('produces the IDENTICAL company-month key the webhook would for the same company+month (shared dedup authority)', async () => {
    const svc = makeSvc({ rows: [{ id: 'co_1', tier: 'pro' }] })
    await runMonthlyCreditGrant(svc as never)

    const cronKey = mockGrantCredits.mock.calls[0][0].idempotencyKey
    const now = new Date()
    const expected = `grant:co_1:${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}`
    expect(cronKey).toBe(expected)
  })

  it('excludes free/trial/no-subscription companies BY THE QUERY (they never reach grantCredits)', async () => {
    // The query already filters; an empty result set means nothing is granted.
    const svc = makeSvc({ rows: [] })

    const result = await runMonthlyCreditGrant(svc as never)

    expect(result).toEqual({ granted: 0 })
    expect(mockGrantCredits).not.toHaveBeenCalled()
    expect(svc.__chain.in).toHaveBeenCalledWith('tier', ['pro', 'business'])
    expect(svc.__chain.not).toHaveBeenCalledWith(
      'stripe_subscription_id',
      'is',
      null,
    )
    expect(svc.__chain.or).toHaveBeenCalledWith(
      'stripe_subscription_status.is.null,stripe_subscription_status.in.(active,trialing)',
    )
  })

  it('per-company resilience: one grantCredits throw does not abort the loop', async () => {
    const rows = [
      { id: 'co_1', tier: 'pro' },
      { id: 'co_2', tier: 'pro' },
      { id: 'co_3', tier: 'pro' },
    ]
    const svc = makeSvc({ rows })
    mockGrantCredits
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('grant boom'))
      .mockResolvedValueOnce(undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await runMonthlyCreditGrant(svc as never)

    // The failing company is not counted; the others still grant.
    expect(result).toEqual({ granted: 2 })
    expect(mockGrantCredits).toHaveBeenCalledTimes(3)
    warn.mockRestore()
  })

  it('returns { granted: 0 } and never throws when the SELECT errors (best-effort)', async () => {
    const svc = makeSvc({ rows: null, selectError: { message: 'rls denied' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await runMonthlyCreditGrant(svc as never)

    expect(result).toEqual({ granted: 0 })
    expect(mockGrantCredits).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('monthlyCreditGrantJob (Inngest function config)', () => {
  type FnInternals = {
    opts: {
      id: string
      triggers?: Array<{ cron?: string; event?: string }>
    }
  }

  it('is created with id "monthly-credit-grant" and cron "0 5 1 * *"', () => {
    const fn = monthlyCreditGrantJob as unknown as FnInternals
    expect(fn.opts.id).toBe('monthly-credit-grant')
    expect(fn.opts.triggers).toBeDefined()
    expect(fn.opts.triggers).toContainEqual({ cron: '0 5 1 * *' })
  })

  it('function body wraps the grant in step.run("grant-monthly-credits", ...)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/monthly-credit-grant.ts'),
      'utf8',
    )
    expect(src).toMatch(/step\.run\(['"]grant-monthly-credits['"]/)
  })
})

describe('monthlyCreditGrantJob is registered in serve()', () => {
  it('app/api/inngest/route.ts imports monthlyCreditGrantJob and includes it in the functions array', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'app/api/inngest/route.ts'),
      'utf8',
    )
    expect(src).toMatch(/monthlyCreditGrantJob/)
  })
})
