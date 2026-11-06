import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * SEED-055 Phase C - THE load-bearing no-double-grant regression (rewrite of the
 * Phase 142 calendar-month version).
 *
 * The dedup authority is now the WINDOW key `grant:{companyId}:{periodKey}`
 * (periodKey = the monthly window start, lib/billing/credit-window.ts), shared by
 * the invoice.paid arm, the checkout.session.completed arm and the daily cron.
 * Whichever lands first grants; the others are no-ops - in either order - and a
 * new window grants again and expires the previous lot.
 *
 * Strategy: the REAL grantMonthlyLot (not mocked) runs against an in-memory fake
 * of the `grant_monthly_lot` RPC that reproduces its contract: no-op when the key
 * exists (BEFORE expiring anything), otherwise expire the company's live monthly
 * lots of another period and grant the new lot.
 *
 * No real secrets / no DB / no network - placeholder ids only (co_1).
 */
type Lot = { id: string; period_key: string; remaining: number; expires_at: string; live: boolean }
type LedgerRow = { company_id: string; idempotency_key: string; delta_credits: number }

const { ledger, lots, rpcCalls } = vi.hoisted(() => ({
  ledger: [] as LedgerRow[],
  lots: [] as Lot[],
  rpcCalls: [] as Array<{ fn: string; params: Record<string, unknown> }>,
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(() => ({
    async rpc(fn: string, params: Record<string, unknown>) {
      rpcCalls.push({ fn, params })
      if (fn !== 'grant_monthly_lot') throw new Error(`unexpected rpc ${fn}`)
      const key = params.p_idempotency_key as string
      const company = params.p_company_id as string
      if (ledger.some((r) => r.company_id === company && r.idempotency_key === key)) {
        return { data: [{ balance_after: 0, applied: false, lot_id: 'lot_x' }], error: null }
      }
      for (const l of lots) {
        if (l.live && l.period_key !== params.p_period_key) l.live = false
      }
      lots.push({
        id: `lot_${lots.length + 1}`,
        period_key: params.p_period_key as string,
        remaining: params.p_credits as number,
        expires_at: params.p_expires_at as string,
        live: true,
      })
      ledger.push({ company_id: company, idempotency_key: key, delta_credits: params.p_credits as number })
      return { data: [{ balance_after: 0, applied: true, lot_id: 'lot_n' }], error: null }
    },
  })),
}))
vi.mock('@/lib/billing/billing-config', () => ({ getBillingConfig: vi.fn() }))
vi.mock('@/lib/notifications/dispatch', () => ({ notify: vi.fn() }))
vi.mock('@/lib/notifications/copy', () => ({ buildNotificationCopy: vi.fn() }))
vi.mock('@/lib/billing/auto-topup', () => ({ triggerAutoTopupIfNeeded: vi.fn() }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: vi.fn() }))

const { grantMonthlyLot } = await import('@/lib/billing/credit-ledger')

const COMPANY = 'co_1'
const GRANT = 9000

// Monthly sub: paid Jun 15 -> Jul 15.
const MONTHLY_END = new Date('2026-07-15T00:00:00Z')
const NOW = new Date('2026-06-15T05:00:00Z')

const webhookGrant = (periodEnd: Date, now: Date) =>
  grantMonthlyLot({ companyId: COMPANY, credits: GRANT, periodEnd, now, refId: 'in_test' })
const cronGrant = (periodEnd: Date, now: Date) =>
  grantMonthlyLot({ companyId: COMPANY, credits: GRANT, periodEnd, now, refId: 'cron' })

describe('LOAD-BEARING - no double-grant per company-window (SEED-055 Phase C)', () => {
  beforeEach(() => {
    ledger.length = 0
    lots.length = 0
    rpcCalls.length = 0
    vi.clearAllMocks()
  })

  it('webhook THEN cron in the same window -> EXACTLY ONE grant, key grant:{company}:{windowStart}', async () => {
    expect(await webhookGrant(MONTHLY_END, NOW)).toEqual({ applied: true })
    expect(await cronGrant(MONTHLY_END, new Date('2026-06-16T05:00:00Z'))).toEqual({ applied: false })

    expect(ledger).toHaveLength(1)
    expect(ledger[0].idempotency_key).toBe('grant:co_1:2026-06-15')
    expect(lots).toHaveLength(1)
    expect(lots[0].live).toBe(true)
  })

  it('cron THEN webhook in the same window -> EXACTLY ONE grant (order-independent)', async () => {
    await cronGrant(MONTHLY_END, NOW)
    expect((await webhookGrant(MONTHLY_END, NOW)).applied).toBe(false)

    expect(ledger).toHaveLength(1)
    expect(ledger[0].idempotency_key).toBe('grant:co_1:2026-06-15')
  })

  it('a redelivered webhook never expires the lot it already granted', async () => {
    await webhookGrant(MONTHLY_END, NOW)
    await webhookGrant(MONTHLY_END, NOW)
    await webhookGrant(MONTHLY_END, NOW)
    expect(lots).toHaveLength(1)
    expect(lots[0].live).toBe(true)
  })

  it('the lot expires at the window end (expires_at = window.end, p_period_key = window start)', async () => {
    await webhookGrant(MONTHLY_END, NOW)
    const params = rpcCalls[0].params
    expect(params.p_expires_at).toBe('2026-07-15T00:00:00.000Z')
    expect(params.p_period_key).toBe('2026-06-15')
    expect(params.p_credits).toBe(GRANT)
  })

  it('annual sub: each monthly anniversary grants a NEW lot and expires the previous one', async () => {
    const annualEnd = new Date('2027-06-15T00:00:00Z')
    await webhookGrant(annualEnd, new Date('2026-06-15T05:00:00Z')) // invoice.paid: month 1
    await cronGrant(annualEnd, new Date('2026-06-16T05:00:00Z')) // daily cron, same window -> no-op
    await cronGrant(annualEnd, new Date('2026-07-15T05:00:00Z')) // month 2
    await cronGrant(annualEnd, new Date('2026-08-15T05:00:00Z')) // month 3

    expect(ledger.map((r) => r.idempotency_key)).toEqual([
      'grant:co_1:2026-06-15',
      'grant:co_1:2026-07-15',
      'grant:co_1:2026-08-15',
    ])
    expect(lots.filter((l) => l.live).map((l) => l.period_key)).toEqual(['2026-08-15'])
  })

  it('a lapsed period (now >= periodEnd) grants nothing and never calls the RPC', async () => {
    expect(await cronGrant(MONTHLY_END, new Date('2026-07-15T00:00:00Z'))).toEqual({ applied: false })
    expect(rpcCalls).toHaveLength(0)
    expect(ledger).toHaveLength(0)
  })

  it('a non-positive grant (free tier = 0) never calls the RPC', async () => {
    const r = await grantMonthlyLot({ companyId: COMPANY, credits: 0, periodEnd: MONTHLY_END, now: NOW })
    expect(r).toEqual({ applied: false })
    expect(rpcCalls).toHaveLength(0)
  })
})
