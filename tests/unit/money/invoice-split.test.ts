import { describe, it, expect } from 'vitest'

/**
 * INVOICE-04 (RED until Wave 1): splitDepositBalance computes deposit + balance
 * in integer minor units such that deposit + balance === total EXACTLY, with no
 * double-rounding drift (Pitfall 4). Balance is always total - deposit
 * (subtraction of the remainder), never an independent Math.round.
 *
 * The target module @/lib/money/invoice-split does not exist yet, so the late
 * await import() throws and every case fails loudly (Nyquist gate).
 */

describe('INVOICE-04: splitDepositBalance (integer-cents exactness)', () => {
  it('splits USD $100.01 at 30% into deposit + balance that sum to the total', async () => {
    const { splitDepositBalance } = await import('@/lib/money/invoice-split')
    const result = splitDepositBalance(100.01, 'USD', 30)
    expect(result).toEqual({ totalCents: 10001, depositCents: 3000, balanceCents: 7001 })
    expect(result.depositCents + result.balanceCents).toBe(result.totalCents)
  })

  it('splits USD $100 at 30% into 3000 / 7000', async () => {
    const { splitDepositBalance } = await import('@/lib/money/invoice-split')
    const result = splitDepositBalance(100, 'USD', 30)
    expect(result.totalCents).toBe(10000)
    expect(result.depositCents).toBe(3000)
    expect(result.balanceCents).toBe(7000)
    expect(result.depositCents + result.balanceCents).toBe(result.totalCents)
  })

  it('handles the $0.01 boundary at 50% without losing a cent', async () => {
    const { splitDepositBalance } = await import('@/lib/money/invoice-split')
    const result = splitDepositBalance(0.01, 'USD', 50)
    // total = round(0.01 * 100) = 1 cent. Whatever the rounding rule, the split
    // must still reconcile exactly — assert the invariant, not a hardcoded split.
    expect(result.totalCents).toBe(1)
    expect(result.depositCents + result.balanceCents).toBe(result.totalCents)
  })

  it('respects a 0-decimal currency (JPY minorUnit:0)', async () => {
    const { splitDepositBalance } = await import('@/lib/money/invoice-split')
    const result = splitDepositBalance(1000, 'JPY', 30)
    expect(result.totalCents).toBe(1000)
    expect(result.depositCents).toBe(300)
    expect(result.balanceCents).toBe(700)
    expect(result.depositCents + result.balanceCents).toBe(result.totalCents)
  })
})
