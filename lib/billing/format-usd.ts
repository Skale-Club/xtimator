// lib/billing/format-usd.ts
// Shared USD formatter for the billing UI — the single source of truth for
// turning a cents integer into a display string. Whole-dollar amounts render
// with no decimals ("$20"); any fractional-dollar amount renders with exactly
// two decimals ("$20.50", "$29.99"). Amounts >= $1,000 get a thousands
// separator ("$1,000"). Negative amounts put the sign BEFORE the currency
// symbol ("-$5.00"), never between it and the digits ("$-5") — and always
// render with two decimals so a negative amount is never ambiguous with a
// truncated positive one. Used everywhere a dollar figure is derived so
// pack/threshold/tier prices stay visually consistent.
//
// formatCredits is the CREDIT-denominated counterpart (CREDITFIX-03): plain
// thousands-separated integer, no currency symbol — credits are not dollars.
// Use this for every credit count (auto-top-up threshold, ledger deltas,
// balances), never formatUsd.

export function formatUsd(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const whole = abs % 100 === 0
  const dollars = abs / 100
  const formatted =
    !negative && whole
      ? dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${negative ? '-' : ''}$${formatted}`
}

export function formatCredits(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}
