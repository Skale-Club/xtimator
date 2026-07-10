// lib/billing/format-usd.ts
// Shared USD formatter for the billing UI — the single source of truth for
// turning a cents integer into a display string. Whole-dollar amounts render
// with no decimals ("$20"); any fractional-dollar amount renders with exactly
// two decimals ("$20.50", "$29.99"). Used everywhere a dollar figure is
// derived so pack/threshold/tier prices stay visually consistent.

export function formatUsd(cents: number): string {
  const whole = cents % 100 === 0
  const dollars = cents / 100
  return `$${whole ? dollars.toFixed(0) : dollars.toFixed(2)}`
}
