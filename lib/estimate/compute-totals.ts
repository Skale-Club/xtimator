// lib/estimate/compute-totals.ts
// ENG-02 + TAX-03: the totals math, extracted pure so the retrocompat golden test guards the
// production code path (not a copy). New fields (line discount, taxable, tax_category, tax_config)
// are read through default-coalescing seams:
//   item.discount ?? 0   → lineNet == lineGross (line discount DORMANT — Phase 131)
//   item.taxable ?? true → ACTIVE this phase (a non-taxable item contributes zero base)
//   taxConfig absent     → flat subtotal × taxRate (the retained, BYTE-IDENTICAL retrocompat branch)
//   taxConfig present    → ACTIVE per-category tax: Σ(taxable_base_per_category × rate_category)
// Discount / deposit / markup activation lands in Phases 131-132 — NOT here.
// Byte-identity discipline (Pitfall 2): BOTH tax branches use the SAME `Math.round(x * 100) / 100`
// expressions as generate-estimate.ts L328-346 — do NOT swap to round2.
//
// TaxConfig shape (mirrors the companies.tax_config JSONB; migration comment: "per-category tax
// rule / labor-exempt"): a per-category rate map plus an optional default_rate. The "labor exempt"
// rule is expressed as { rates: { labor: 0, materials: <rate> } }.
//
// Per-item rate resolution (documented, so no taxable item silently escapes tax):
//   1. rates[item.tax_category]  (when the category resolves to a number)
//   2. config.default_rate       (when set)
//   3. the option `taxRate`      (final fallback)

export interface TaxConfig {
  rates: { labor?: number; materials?: number; other?: number }
  default_rate?: number
}

export interface ComputeTotalsItem {
  quantity: number
  unit_price: number
  discount?: number | null   // line discount (dormant — defaults to 0)
  cost?: number | null       // MARK-01 — per-unit cost basis (AI INPUT); server derives unit_price
  markup_pct?: number | null // MARK-01 — markup percent applied to cost (AI INPUT)
  taxable?: boolean | null   // ACTIVE (TAX-03) — defaults to true
  tax_category?: 'labor' | 'materials' | 'other' | null  // ACTIVE (TAX-03) per-category key
  [key: string]: unknown
}

export interface ComputeTotalsSection {
  title: string
  items: ComputeTotalsItem[]
}

export interface ComputeTotalsResult {
  sections: Array<{ title: string; items: Array<ComputeTotalsItem & { total: number }>; subtotal: number }>
  subtotal: number
  discountAmount: number   // DISC-02: computed global discount (disc_global) for persistence (Plan 131-03)
  taxAmount: number
  grandTotal: number
  deposit: number          // DEP-01: deposit computed from grandTotal (absent/'none'/null → 0)
  balanceDue: number       // DEP-01: round2(grandTotal − deposit) ('none' → grandTotal)
}

export interface ComputeTotalsOptions {
  taxRate: number
  taxConfig?: TaxConfig | null   // null = flat default_tax_rate path (retrocompat); present = per-category
  // DISC-02: global discount (whole-number percent, e.g. 10 → 10%). Absent/'none'/null → disc_global 0
  // (byte-identical retrocompat).
  discountType?: 'amount' | 'percent' | 'none' | null
  discountValue?: number | null
  // DEP-01: deposit configuration. Absent/'none'/null → deposit 0 → balanceDue = grandTotal
  // (byte-identical retrocompat; the persisted estimates.deposit_* columns stay the dormant default).
  // 'percent' → deposit = round2(grandTotal × deposit_value/100); 'amount' → deposit = round2(deposit_value).
  depositType?: 'none' | 'percent' | 'amount' | null
  depositValue?: number | null
}

/**
 * Type guard for a well-formed TaxConfig. A malformed value degrades to the flat path
 * (GUARD-03 never-throw discipline) rather than activating a broken per-category branch.
 */
function isTaxConfig(value: unknown): value is TaxConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'rates' in value &&
    typeof (value as { rates: unknown }).rates === 'object' &&
    (value as { rates: unknown }).rates !== null
  )
}

/**
 * Estimate totals. With no new fields present (discount 0, taxable true, taxConfig null) the
 * output is BYTE-IDENTICAL to the pre-v4.11 flat-rate engine (ENG-02). When taxConfig is
 * present, tax is computed PER-CATEGORY: taxAmount = Σ(taxable_base_per_category × rate_category)
 * with non-taxable items contributing zero base (TAX-03).
 */
export function computeEstimateTotals(
  sections: ComputeTotalsSection[],
  { taxRate, taxConfig, discountType, discountValue, depositType, depositValue }: ComputeTotalsOptions
): ComputeTotalsResult {
  const calculatedSections = sections.map((section) => {
    const items = section.items.map((item) => {
      // MARK-01: server-derive unit_price from cost × (1 + markup_pct/100) when the AI supplied
      // cost + markup and gave NO explicit positive unit_price. Explicit unit_price WINS. Never
      // trusts the LLM to compute the marked-up price (ENG-01 / GUARD-03). SAME Math.round(x*100)/100
      // byte discipline. cost/markup absent → effectiveUnitPrice === item.unit_price → byte-identical.
      // Price-book anchoring/clamp (GUARD-02) runs in the engine BEFORE compute-totals and still
      // overrides — markup only resolves the price the AI gave, it does not fight anchoring.
      const hasMarkup = item.cost != null && item.markup_pct != null
      const hasExplicitPrice = typeof item.unit_price === 'number' && item.unit_price > 0
      const effectiveUnitPrice =
        hasMarkup && !hasExplicitPrice
          ? Math.round((item.cost as number) * (1 + (item.markup_pct as number) / 100) * 100) / 100
          : item.unit_price
      const lineGross = Math.round(item.quantity * effectiveUnitPrice * 100) / 100
      const lineDiscount = item.discount ?? 0   // DORMANT: default 0 → lineNet == lineGross (Phase 131)
      const lineNet = lineGross - lineDiscount
      // Return the resolved unit_price so persistence + downstream read it. No-op when no markup
      // (effectiveUnitPrice === item.unit_price) → byte-identical retrocompat.
      return { ...item, unit_price: effectiveUnitPrice, total: lineNet }
    })
    const sectionSubtotal = items.reduce((sum, item) => sum + item.total, 0)
    return { title: section.title, items, subtotal: Math.round(sectionSubtotal * 100) / 100 }
  })

  const subtotal =
    Math.round(calculatedSections.reduce((sum, s) => sum + s.subtotal, 0) * 100) / 100

  // DISC-02: global discount (amount or percent) applied BEFORE tax (US-norm default).
  // discountValue percent is a whole number (10 → 10%). When no global discount → 0
  // (byte-identical retrocompat). FOLLOW-UP: a per-company discount-timing (before/after-tax)
  // config is not read here — only before-tax is implemented; wire an after-tax branch when a
  // companies.* timing flag is cheaply available (see REQUIREMENTS.md DISC-02).
  const discGlobal =
    discountType === 'amount'
      ? Math.round((discountValue ?? 0) * 100) / 100
      : discountType === 'percent'
        ? Math.round(subtotal * ((discountValue ?? 0) / 100) * 100) / 100
        : 0

  let taxAmount: number
  if (!isTaxConfig(taxConfig)) {
    // RETROCOMPAT (taxConfig absent / null / malformed) → flat (subtotal − disc_global) × taxRate.
    // When discGlobal === 0 this is BYTE-IDENTICAL to the pre-v4.11 `subtotal × taxRate` expression.
    taxAmount = Math.round((subtotal - discGlobal) * taxRate * 100) / 100
  } else {
    // TAX-03 ACTIVE: accumulate each taxable item's lineNet into its category base, then
    // sum base × resolved rate. Non-taxable items (taxable === false) accrue ZERO base.
    const categoryBase: Record<string, number> = {}
    for (const section of calculatedSections) {
      for (const item of section.items) {
        const isTaxable = item.taxable ?? true   // ACTIVATE the dormant default
        if (!isTaxable) continue
        const category = item.tax_category ?? 'other'
        categoryBase[category] = (categoryBase[category] ?? 0) + item.total
      }
    }

    // DISC-02 PRORATION: distribute disc_global across each category's taxable base by its share
    // of the taxable subtotal, subtracting it BEFORE multiplying by the rate (discount-before-tax).
    // When the taxable subtotal is 0, prorate nothing (avoid /0).
    const taxableSubtotal = Object.values(categoryBase).reduce((sum, b) => sum + b, 0)

    let rawTax = 0
    for (const [category, base] of Object.entries(categoryBase)) {
      const categoryRate = (taxConfig.rates as Record<string, number | undefined>)[category]
      // Resolution: per-category rate → config.default_rate → option taxRate (no silent escape).
      const rate =
        typeof categoryRate === 'number'
          ? categoryRate
          : typeof taxConfig.default_rate === 'number'
            ? taxConfig.default_rate
            : taxRate
      const proratedDisc =
        taxableSubtotal > 0
          ? Math.round(discGlobal * (base / taxableSubtotal) * 100) / 100
          : 0
      const discountedBase = base - proratedDisc
      rawTax += discountedBase * rate
    }
    // SAME Math.round(x*100)/100 discipline as the flat path for byte-consistency.
    taxAmount = Math.round(rawTax * 100) / 100
  }

  const grandTotal = Math.round(((subtotal - discGlobal) + taxAmount) * 100) / 100

  // DEP-01 (LOCKED sequence): deposit computed from grandTotal; balanceDue = grandTotal − deposit.
  // depositType absent / 'none' / null → deposit 0 → balanceDue = grandTotal (byte-identical retrocompat).
  // SAME Math.round(x * 100) / 100 form as the totals above (NOT a round2 import) for byte-consistency.
  // No clamp: out-of-range guarding (a deposit exceeding the total) is a Phase-133 editor concern; the
  // pure math stays a faithful subtraction (balanceDue may be negative — deposit-totals.test.ts case 4).
  const deposit =
    depositType === 'percent'
      ? Math.round(grandTotal * ((depositValue ?? 0) / 100) * 100) / 100
      : depositType === 'amount'
        ? Math.round((depositValue ?? 0) * 100) / 100
        : 0
  const balanceDue = Math.round((grandTotal - deposit) * 100) / 100

  return { sections: calculatedSections, subtotal, discountAmount: discGlobal, taxAmount, grandTotal, deposit, balanceDue }
}
