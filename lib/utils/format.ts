/**
 * Shared formatting utilities
 */

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)
}

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

/**
 * Format integer cents as a USD currency string.
 *
 *   formatUSD(0)        -> "$0.00"
 *   formatUSD(100)      -> "$1.00"
 *   formatUSD(50000)    -> "$500.00"
 *   formatUSD(1234567)  -> "$12,345.67"
 *   formatUSD(null)     -> "$0.00"
 *
 * Used by the public estimate share page to render the "Pay $X" button label
 * (Phase 70 — Stripe Connect customer payments).
 */
export function formatUSD(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return USD.format(0)
  return USD.format(cents / 100)
}
