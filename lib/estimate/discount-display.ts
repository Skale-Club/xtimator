// lib/estimate/discount-display.ts
// PDFPAR-01 (v4.23): the SHARED read seam for the discount_type spelling
// fragmentation across the codebase — schema persists 'percentage'|'fixed',
// the AI write-path persists 'amount', and the totals engine persists
// 'percent'|'amount' internally. All renderers call this one predicate so a
// percentage discount shows its (x%) suffix consistently, instead of 4
// duplicated inline `=== 'percentage'` checks silently drifting from the
// engine-internal 'percent' spelling.

export function isPercentageDiscount(discountType: string | null): boolean {
  return discountType === 'percentage' || discountType === 'percent'
}
