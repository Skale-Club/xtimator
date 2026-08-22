import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ADMIN-BILLING-02 fix (bug): grantBonusCredits used to insert a negative
 * usage_events row with event_type='estimate_generated'. checkQuota
 * (lib/quota.ts) counts ROWS, so that "bonus" row itself CONSUMED one
 * estimate-quota slot while the owner was told they'd received credits.
 *
 * Fixed: grantBonusCredits now grants real balance via grantCredits
 * (lib/billing/credit-ledger.ts) against the credit_ledger / cached
 * companies.credit_balance, and never touches usage_events at all.
 */

const requireAdminMock = vi.fn(async () => ({ userId: 'admin-1', email: 'admin@x.com' }))
vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: () => requireAdminMock(),
}))

const grantCreditsMock = vi.fn(async () => undefined)
const reconcileBalanceMock = vi.fn(async () => 0)
vi.mock('@/lib/billing/credit-ledger', () => ({
  grantCredits: (...args: [unknown]) => grantCreditsMock(...args),
  reconcileBalance: (...args: [unknown]) => reconcileBalanceMock(...args),
}))

// insertMock lets us assert usage_events.insert is NEVER called by
// grantBonusCredits. selectMock backs the owner-lookup for the
// notification (companies.select('user_id').eq('id', companyId).single()).
const insertMock = vi.fn(async () => ({ error: null }))
const singleMock = vi.fn(async () => ({ data: { user_id: 'owner-1' }, error: null }))
const fromMock = vi.fn((table: string) => {
  if (table === 'usage_events') {
    return { insert: insertMock }
  }
  if (table === 'companies') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: singleMock,
        }),
      }),
    }
  }
  throw new Error(`Unexpected table: ${table}`)
})
// rpcMock backs the atomic apply_credit_ledger_entry call — the ONLY write
// grantBonusCredits performs; its error surfaces as { ok: false }.
const rpcMock = vi.fn(async () => ({ data: [{ balance_after: 2500, applied: true }], error: null }))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: fromMock, rpc: rpcMock }),
}))

vi.mock('@/lib/admin/audit-log', () => ({
  logAdminAction: vi.fn(async () => undefined),
}))

vi.mock('@/lib/notifications/dispatch', () => ({
  notify: vi.fn(async () => undefined),
}))

vi.mock('@/lib/notifications/copy', () => ({
  buildNotificationCopy: () => ({ title: 'title', body: 'body' }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { grantBonusCredits } from '@/app/admin/billing/actions'
import { logAdminAction } from '@/lib/admin/audit-log'

const logAdminActionMock = vi.mocked(logAdminAction)

beforeEach(() => {
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 'admin-1', email: 'admin@x.com' })
  grantCreditsMock.mockClear()
  reconcileBalanceMock.mockClear()
  rpcMock.mockClear()
  rpcMock.mockResolvedValue({ data: [{ balance_after: 2500, applied: true }], error: null })
  insertMock.mockClear()
  singleMock.mockClear()
  singleMock.mockResolvedValue({ data: { user_id: 'owner-1' }, error: null })
  fromMock.mockClear()
  logAdminActionMock.mockClear()
})

describe('grantBonusCredits — ledger-backed grant (ADMIN-BILLING-02 fix)', () => {
  it('applies the grant through apply_credit_ledger_entry with reason "grant"', async () => {
    const res = await grantBonusCredits('company-1', 25)

    expect(res.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith(
      'apply_credit_ledger_entry',
      expect.objectContaining({
        p_company_id: 'company-1',
        p_delta_credits: 25,
        p_reason: 'grant',
        p_ref_id: 'admin-bonus',
      })
    )
    // The never-throw helper is NOT used: a failed grant must surface.
    expect(grantCreditsMock).not.toHaveBeenCalled()
  })

  it('passes a unique idempotencyKey scoped to the acting admin', async () => {
    await grantBonusCredits('company-1', 10)

    const args = rpcMock.mock.calls[0][1] as { p_idempotency_key?: string }
    expect(args.p_idempotency_key).toMatch(/^bonus:admin-1:/)
  })

  it('surfaces an RPC failure as { ok: false } without logging or notifying', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })

    const res = await grantBonusCredits('company-1', 10)

    expect(res).toEqual({ ok: false, message: 'boom' })
    expect(logAdminActionMock).not.toHaveBeenCalled()
    expect(singleMock).not.toHaveBeenCalled()
  })

  it('never inserts a usage_events row', async () => {
    await grantBonusCredits('company-1', 10)

    expect(insertMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalledWith('usage_events')
  })

  it('rejects a non-positive units value without touching the ledger', async () => {
    const res = await grantBonusCredits('company-1', 0)

    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('logs the bonus_credits.grant audit action', async () => {
    await grantBonusCredits('company-1', 10)

    expect(logAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'bonus_credits.grant', targetId: 'company-1' })
    )
  })
})
