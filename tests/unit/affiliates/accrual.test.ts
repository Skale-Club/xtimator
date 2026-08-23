import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * STRIPE-REFUND-01 Fix 1 — reverseCommissionForInvoice.
 *
 * Flips affiliate_commissions rows for a given stripe_invoice_id from
 * 'pending'/'payable' to 'reversed'. Never throws (same contract as
 * accrueCommissionForInvoice) — called from the Stripe webhook's best-effort
 * refund/dispute side-effect path.
 */

const mockIn = vi.fn()
const mockEq = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn().mockReturnValue({
    from: vi.fn().mockImplementation(() => ({
      update: (...args: unknown[]) => {
        mockUpdate(...args)
        return { eq: mockEq }
      },
    })),
  }),
}))

const { reverseCommissionForInvoice } = await import('@/lib/affiliates/accrual')

beforeEach(() => {
  vi.clearAllMocks()
  mockEq.mockReturnValue({ in: mockIn })
  mockIn.mockResolvedValue({ error: null })
})

describe('reverseCommissionForInvoice', () => {
  it("flips 'pending'/'payable' rows for the invoice to 'reversed'", async () => {
    await reverseCommissionForInvoice({ invoiceId: 'in_123', reason: 'refund' })

    expect(mockUpdate).toHaveBeenCalledWith({ status: 'reversed' })
    expect(mockEq).toHaveBeenCalledWith('stripe_invoice_id', 'in_123')
    expect(mockIn).toHaveBeenCalledWith('status', ['pending', 'payable'])
  })

  it('is a no-op (never throws) when invoiceId is empty', async () => {
    await expect(reverseCommissionForInvoice({ invoiceId: '', reason: 'refund' })).resolves.toBeUndefined()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('never throws when the update errors — swallows and logs', async () => {
    mockIn.mockResolvedValue({ error: { message: 'db down' } })

    await expect(
      reverseCommissionForInvoice({ invoiceId: 'in_err', reason: 'dispute' })
    ).resolves.toBeUndefined()
  })

  it('is idempotent — a redelivery matching zero rows (already reversed) is not an error', async () => {
    mockIn.mockResolvedValue({ error: null })

    await expect(
      reverseCommissionForInvoice({ invoiceId: 'in_already_reversed', reason: 'refund' })
    ).resolves.toBeUndefined()
  })
})
