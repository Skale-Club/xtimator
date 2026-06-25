// lib/estimate/compute-totals.ts
// ENG-02 SCAFFOLD: the default-path totals math, extracted pure so the retrocompat golden test
// guards the production code path (not a copy). New fields (line discount, taxable, tax_config)
// are read through default-coalescing seams that COLLAPSE to today's flat computation:
//   item.discount ?? 0   → lineNet == lineGross (byte-identical)
//   taxConfig absent     → flat subtotal × taxRate (the retained retrocompat branch)
// The ACTIVE per-item-tax / discount / deposit / markup math lands in Phases 130-132 — NOT here.
// Byte-identity discipline (Pitfall 2): the default-path arithmetic uses the SAME
// `Math.round(x * 100) / 100` expressions as generate-estimate.ts L328-346 — do NOT swap to round2.

export interface ComputeTotalsItem {
  quantity: number
  unit_price: number
  discount?: number | null   // line discount (dormant — defaults to 0)
  taxable?: boolean | null   // dormant — defaults to true
  [key: string]: unknown
}

export interface ComputeTotalsSection {
  title: string
  items: ComputeTotalsItem[]
}

export interface ComputeTotalsResult {
  sections: Array<{ title: string; items: Array<ComputeTotalsItem & { total: number }>; subtotal: number }>
  subtotal: number
  taxAmount: number
  grandTotal: number
}

export interface ComputeTotalsOptions {
  taxRate: number
  taxConfig?: unknown | null   // dormant — null = flat default_tax_rate path (retrocompat)
}

/**
 * Default-path estimate totals. With no new fields present (discount 0, taxable true,
 * taxConfig null) the output is BYTE-IDENTICAL to the pre-v4.11 flat-rate engine.
 */
export function computeEstimateTotals(
  sections: ComputeTotalsSection[],
  { taxRate }: ComputeTotalsOptions
): ComputeTotalsResult {
  const calculatedSections = sections.map((section) => {
    const items = section.items.map((item) => {
      const lineGross = Math.round(item.quantity * item.unit_price * 100) / 100
      const lineDiscount = item.discount ?? 0   // SCAFFOLD: default 0 → lineNet == lineGross today
      const lineNet = lineGross - lineDiscount
      return { ...item, total: lineNet }
    })
    const sectionSubtotal = items.reduce((sum, item) => sum + item.total, 0)
    return { title: section.title, items, subtotal: Math.round(sectionSubtotal * 100) / 100 }
  })

  const subtotal =
    Math.round(calculatedSections.reduce((sum, s) => sum + s.subtotal, 0) * 100) / 100
  // SCAFFOLD: taxConfig absent → flat subtotal × taxRate (the retrocompat branch).
  // Per-category/per-item tax activates in Phase 130 (TAX-03).
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100
  const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100

  return { sections: calculatedSections, subtotal, taxAmount, grandTotal }
}
