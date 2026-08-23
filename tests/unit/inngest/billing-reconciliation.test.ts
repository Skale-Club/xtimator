import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Pre-launch audit follow-up (FIX 3) — billingReconciliationJob daily cron
 * tests.
 *
 * Mirrors monthly-credit-grant-job.test.ts / cleanup-audio-job.test.ts.
 *
 * Contract under test (runBillingReconciliation in
 * lib/inngest/functions/billing-reconciliation.ts):
 *   (a) credit_balance_drift: companies.credit_balance vs
 *       SUM(credit_ledger.delta_credits) per company. Drift found →
 *       notifyOps('credit_balance_drift', severity:'error') listing up to 10
 *       drifting company ids. NEVER auto-repairs (no companies.update call).
 *   (b) paid_tier_without_subscription: tier IN ('pro','business') AND
 *       stripe_subscription_id IS NULL → notifyOps(severity:'warning').
 *   (c) stale_open_invoices: invoices.status='open' AND created_at older
 *       than 30 days → notifyOps(severity:'warning').
 *   - Each check is independent: a DB error on one check never throws out of
 *     the step and never prevents the other checks from running.
 *   - billingReconciliationJob: id 'billing-reconciliation', cron
 *     '0 6 * * *', body wrapped in step.run('reconcile-billing', ...).
 *   - app/api/inngest/route.ts registers billingReconciliationJob.
 *
 * No real secrets — placeholder ids only.
 */

const { mockNotifyOps } = vi.hoisted(() => ({ mockNotifyOps: vi.fn() }))
vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: mockNotifyOps,
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import {
  runBillingReconciliation,
  billingReconciliationJob,
} from '@/lib/inngest/functions/billing-reconciliation'

/**
 * Chainable svc.from(table).select(cols)[...filters] fake. Resolves per-table
 * (and, for `companies`, per-column-set — the module queries `companies`
 * TWICE with different projections) via a thenable chain, matching the
 * pattern already used in seat-billing-interval.test.ts / monthly-credit-
 * grant-job.test.ts's chainable mocks.
 */
function makeSvc(opts: {
  companiesBalanceRows?: Array<{ id: string; credit_balance: number }> | null
  companiesBalanceError?: { message: string } | null
  ledgerRows?: Array<{ company_id: string; delta_credits: number }> | null
  ledgerError?: { message: string } | null
  paidTierRows?: Array<{ id: string; tier: string }> | null
  paidTierError?: { message: string } | null
  invoicesRows?: Array<{ id: string }> | null
  invoicesError?: { message: string } | null
}) {
  function chain(resolveValue: { data: unknown; error: unknown }) {
    const c: Record<string, unknown> = {}
    c.eq = vi.fn(() => c)
    c.in = vi.fn(() => c)
    c.is = vi.fn(() => c)
    c.lt = vi.fn(() => c)
    c.not = vi.fn(() => c)
    // The drift check pages with .range(from, to) so a >1000-row ledger is not
    // silently truncated: serve the whole fixture on the first page and an
    // empty page after, which is what a real short read looks like.
    c.range = vi.fn((from: number) =>
      from === 0 ? resolveValue : { ...resolveValue, data: [] },
    )
    c.then = (resolve: (v: unknown) => void) => resolve(resolveValue)
    return c
  }

  const from = vi.fn((table: string) => ({
    select: vi.fn((cols: string) => {
      if (table === 'companies' && cols.includes('credit_balance')) {
        return chain({
          data: opts.companiesBalanceRows ?? [],
          error: opts.companiesBalanceError ?? null,
        })
      }
      if (table === 'companies' && cols.includes('tier')) {
        return chain({
          data: opts.paidTierRows ?? [],
          error: opts.paidTierError ?? null,
        })
      }
      if (table === 'credit_ledger') {
        return chain({ data: opts.ledgerRows ?? [], error: opts.ledgerError ?? null })
      }
      if (table === 'invoices') {
        return chain({ data: opts.invoicesRows ?? [], error: opts.invoicesError ?? null })
      }
      throw new Error(`unexpected table/cols in test: ${table} / ${cols}`)
    }),
  }))

  return { from }
}

describe('runBillingReconciliation — (a) credit_balance_drift', () => {
  beforeEach(() => {
    mockNotifyOps.mockClear()
    mockNotifyOps.mockResolvedValue(undefined)
  })

  it('reports drifting company ids and fires notifyOps(severity:error) when balances disagree', async () => {
    const svc = makeSvc({
      companiesBalanceRows: [
        { id: 'co_ok', credit_balance: 100 },
        { id: 'co_drift', credit_balance: 999 }, // ledger only sums to 50
      ],
      ledgerRows: [
        { company_id: 'co_ok', delta_credits: 60 },
        { company_id: 'co_ok', delta_credits: 40 },
        { company_id: 'co_drift', delta_credits: 50 },
      ],
    })

    const result = await runBillingReconciliation(svc as never)

    expect(result.driftCount).toBe(1)
    expect(result.driftCompanyIds).toEqual(['co_drift'])
    expect(mockNotifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'credit_balance_drift',
        severity: 'error',
        message: expect.stringContaining('co_drift'),
      }),
    )
  })

  it('caps the reported id list at 10 while driftCount reports the true total', async () => {
    const companiesBalanceRows = Array.from({ length: 15 }, (_, i) => ({
      id: `co_${i}`,
      credit_balance: 100, // all drift — ledger has nothing for any of them
    }))
    const svc = makeSvc({ companiesBalanceRows, ledgerRows: [] })

    const result = await runBillingReconciliation(svc as never)

    expect(result.driftCount).toBe(15)
    expect(result.driftCompanyIds).toHaveLength(10)
    const call = mockNotifyOps.mock.calls.find(
      (c) => (c[0] as { kind?: string })?.kind === 'credit_balance_drift',
    )
    expect(call).toBeDefined()
  })

  it('clean: no drift → notifyOps NOT called for credit_balance_drift, driftCount 0', async () => {
    const svc = makeSvc({
      companiesBalanceRows: [{ id: 'co_ok', credit_balance: 90 }],
      ledgerRows: [{ company_id: 'co_ok', delta_credits: 90 }],
    })

    const result = await runBillingReconciliation(svc as never)

    expect(result.driftCount).toBe(0)
    expect(result.driftCompanyIds).toEqual([])
    expect(mockNotifyOps).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'credit_balance_drift' }),
    )
  })

  it('a company absent from the ledger entirely (no rows) defaults its expected sum to 0, not a crash', async () => {
    const svc = makeSvc({
      companiesBalanceRows: [{ id: 'co_never_charged', credit_balance: 0 }],
      ledgerRows: [],
    })

    const result = await runBillingReconciliation(svc as never)

    expect(result.driftCount).toBe(0)
  })

  it('DB error on the companies select → no throw, driftCount 0, no drift alert', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const svc = makeSvc({
      companiesBalanceError: { message: 'rls denied' },
    })

    await expect(runBillingReconciliation(svc as never)).resolves.toMatchObject({
      driftCount: 0,
      driftCompanyIds: [],
    })
    expect(mockNotifyOps).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'credit_balance_drift' }),
    )
    warn.mockRestore()
  })

  it('DB error on the credit_ledger select → no throw, driftCount 0, no drift alert', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const svc = makeSvc({
      companiesBalanceRows: [{ id: 'co_1', credit_balance: 10 }],
      ledgerError: { message: 'timeout' },
    })

    await expect(runBillingReconciliation(svc as never)).resolves.toMatchObject({
      driftCount: 0,
      driftCompanyIds: [],
    })
    expect(mockNotifyOps).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'credit_balance_drift' }),
    )
    warn.mockRestore()
  })

  it('never auto-repairs — no write call is made anywhere in the reconciliation (svc.from is only ever asked to .select)', async () => {
    const svc = makeSvc({
      companiesBalanceRows: [{ id: 'co_drift', credit_balance: 999 }],
      ledgerRows: [],
    })
    // makeSvc's `from` only implements `.select` — if the module ever tried
    // `.update`/`.insert`/`.delete` this would throw (undefined is not a
    // function), proving no repair write path exists.
    await expect(runBillingReconciliation(svc as never)).resolves.toBeDefined()
  })
})

describe('runBillingReconciliation — (b) paid_tier_without_subscription', () => {
  beforeEach(() => {
    mockNotifyOps.mockClear()
    mockNotifyOps.mockResolvedValue(undefined)
  })

  it('flags paid-tier companies with no Stripe subscription id, severity warning', async () => {
    const svc = makeSvc({
      paidTierRows: [
        { id: 'co_paid_no_sub_1', tier: 'pro' },
        { id: 'co_paid_no_sub_2', tier: 'business' },
      ],
    })

    const result = await runBillingReconciliation(svc as never)

    expect(result.paidWithoutSubscriptionCount).toBe(2)
    expect(mockNotifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'paid_tier_without_subscription',
        severity: 'warning',
        message: expect.stringContaining('co_paid_no_sub_1'),
      }),
    )
  })

  it('clean: no paid-tier-without-subscription rows → notifyOps not called for this kind', async () => {
    const svc = makeSvc({ paidTierRows: [] })

    const result = await runBillingReconciliation(svc as never)

    expect(result.paidWithoutSubscriptionCount).toBe(0)
    expect(mockNotifyOps).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'paid_tier_without_subscription' }),
    )
  })

  it('DB error → no throw, count 0, no alert', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const svc = makeSvc({ paidTierError: { message: 'boom' } })

    await expect(runBillingReconciliation(svc as never)).resolves.toMatchObject({
      paidWithoutSubscriptionCount: 0,
    })
    expect(mockNotifyOps).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'paid_tier_without_subscription' }),
    )
    warn.mockRestore()
  })
})

describe('runBillingReconciliation — (c) stale_open_invoices', () => {
  beforeEach(() => {
    mockNotifyOps.mockClear()
    mockNotifyOps.mockResolvedValue(undefined)
  })

  it('flags invoices stuck open past 30 days, severity warning', async () => {
    const svc = makeSvc({ invoicesRows: [{ id: 'inv_1' }, { id: 'inv_2' }, { id: 'inv_3' }] })

    const result = await runBillingReconciliation(svc as never)

    expect(result.staleOpenInvoicesCount).toBe(3)
    expect(mockNotifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'stale_open_invoices',
        severity: 'warning',
      }),
    )
  })

  it('clean: no stale open invoices → notifyOps not called for this kind', async () => {
    const svc = makeSvc({ invoicesRows: [] })

    const result = await runBillingReconciliation(svc as never)

    expect(result.staleOpenInvoicesCount).toBe(0)
    expect(mockNotifyOps).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'stale_open_invoices' }),
    )
  })

  it('DB error → no throw, count 0, no alert', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const svc = makeSvc({ invoicesError: { message: 'boom' } })

    await expect(runBillingReconciliation(svc as never)).resolves.toMatchObject({
      staleOpenInvoicesCount: 0,
    })
    expect(mockNotifyOps).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'stale_open_invoices' }),
    )
    warn.mockRestore()
  })
})

describe('runBillingReconciliation — independence across checks', () => {
  beforeEach(() => {
    mockNotifyOps.mockClear()
    mockNotifyOps.mockResolvedValue(undefined)
  })

  it('a failure in one check does not prevent the other checks from running/reporting', async () => {
    const svc = makeSvc({
      companiesBalanceError: { message: 'boom on drift check' },
      paidTierRows: [{ id: 'co_paid', tier: 'pro' }],
      invoicesRows: [{ id: 'inv_stale' }],
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await runBillingReconciliation(svc as never)

    expect(result.driftCount).toBe(0) // failed check degrades gracefully
    expect(result.paidWithoutSubscriptionCount).toBe(1) // unaffected
    expect(result.staleOpenInvoicesCount).toBe(1) // unaffected
    warn.mockRestore()
  })
})

describe('billingReconciliationJob (Inngest function config)', () => {
  type FnInternals = {
    opts: {
      id: string
      triggers?: Array<{ cron?: string; event?: string }>
    }
  }

  it('is created with id "billing-reconciliation" and cron "0 6 * * *"', () => {
    const fn = billingReconciliationJob as unknown as FnInternals
    expect(fn.opts.id).toBe('billing-reconciliation')
    expect(fn.opts.triggers).toBeDefined()
    expect(fn.opts.triggers).toContainEqual({ cron: '0 6 * * *' })
  })

  it('function body wraps the reconciliation in step.run("reconcile-billing", ...)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/billing-reconciliation.ts'),
      'utf8',
    )
    expect(src).toMatch(/step\.run\(['"]reconcile-billing['"]/)
  })
})

describe('billingReconciliationJob is registered in serve()', () => {
  it('app/api/inngest/route.ts imports billingReconciliationJob and includes it in the functions array', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/api/inngest/route.ts'), 'utf8')
    expect(src).toMatch(/billingReconciliationJob/)
  })

  it('lib/inngest/functions/index.ts exports billingReconciliationJob', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/index.ts'),
      'utf8',
    )
    expect(src).toMatch(/export \{ billingReconciliationJob \}/)
  })
})
