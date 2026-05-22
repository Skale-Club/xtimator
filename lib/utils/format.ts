import {
  DEFAULT_CURRENCY_CODE,
  formatMinorUnits,
  formatMoney,
  type SupportedCurrencyCode,
} from '@/lib/money/currency'

/**
 * Shared formatting utilities.
 */
export function formatCurrency(
  value: number,
  currencyCode: SupportedCurrencyCode | string | null | undefined = DEFAULT_CURRENCY_CODE,
): string {
  return formatMoney(value, currencyCode)
}

/**
 * Format integer minor units as a currency string.
 *
 * Kept as `formatUSD` for compatibility with older payment call sites; callers
 * can pass a currency code to format non-USD payment amounts.
 */
export function formatUSD(
  cents: number | null | undefined,
  currencyCode: SupportedCurrencyCode | string | null | undefined = DEFAULT_CURRENCY_CODE,
): string {
  return formatMinorUnits(cents, currencyCode)
}
