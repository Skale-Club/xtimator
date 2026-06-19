import { toMinorUnits } from '@/lib/money/currency'

/**
 * Phase 94 (INVOICE-04) — Cents-exact deposit / balance split.
 *
 * Splits an estimate total into a deposit and a balance in integer minor units
 * (cents for 2-decimal currencies, whole units for 0-decimal currencies like JPY)
 * such that `depositCents + balanceCents === totalCents` EXACTLY, for every input.
 *
 * The total is converted to minor units exactly ONCE via `toMinorUnits`. The
 * deposit is the only rounded value; the balance is the remainder by subtraction
 * (never a second independent rounding). Subtraction-of-remainder guarantees
 * the two parts always reconcile to the total — avoiding the off-by-1 minor-unit
 * drift that double-rounding the deposit AND the balance can produce (Pitfall 4).
 *
 * @param totalDollars  Estimate total in major units (e.g. dollars).
 * @param currencyCode  Currency code (drives the minor-unit scale).
 * @param depositPct    Deposit percentage (0..100). 100 → deposit === total, balance === 0.
 */
export function splitDepositBalance(
  totalDollars: number,
  currencyCode: string,
  depositPct: number,
): { totalCents: number; depositCents: number; balanceCents: number } {
  const totalCents = toMinorUnits(totalDollars, currencyCode)
  const depositCents = Math.round((totalCents * depositPct) / 100)
  const balanceCents = totalCents - depositCents // subtraction → exact sum (Pitfall 4)
  return { totalCents, depositCents, balanceCents }
}
