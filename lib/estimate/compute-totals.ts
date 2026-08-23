// lib/estimate/compute-totals.ts
// ENG-02 + TAX-03: the totals math, extracted pure so the retrocompat golden test guards the
// production code path (not a copy). New fields (line discount, taxable, tax_category, tax_config)
// are read through default-coalescing seams:
//   item.discount ?? 0   → lineNet == lineGross (line discount DORMANT — Phase 131)
//   item.taxable ?? true → ACTIVE in BOTH tax branches (a non-taxable item contributes zero base)
//   taxConfig absent     → flat (taxable subtotal − prorated disc) × taxRate. Phase 165 (SAVE-07)
//                          made `taxable` ACTIVE here too (previously the flat path ignored it,
//                          taxing the WHOLE subtotal) — an all-taxable estimate (taxable defaults
//                          true) is still BYTE-IDENTICAL to the pre-165 retrocompat branch.
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
//
// BILL-CONSTRAINT-01 (FIX 1 + FIX 2): the deposit is now resolved via
// lib/billing/charge-amount's resolveChargeAmount — the SAME integer-cents
// authority the Stripe charge amount uses — instead of an independent
// dollar-space Math.round. Two consequences, both deliberate:
//   FIX 1 — resolveChargeAmount clamps its result to [0, totalCents], so a
//     deposit can never render negative or exceed the grand total even from a
//     bad legacy row (mirrors the existing balanceDue floor).
//   FIX 2 — computing in cents (not dollars-then-round) eliminates the
//     one-minor-unit drift the two engines could previously disagree on for
//     exact-half-cent totals (e.g. $10.03 at 50% → dollar-space rounds to
//     $5.01, cents-space rounds to $5.02); the printed deposit and the
//     invoiced charge are now guaranteed identical.
// This module stays PURE: lib/money/currency and lib/billing/charge-amount
// are both pure (no DB, no 'server-only').

import { fromMinorUnits } from '@/lib/money/currency'
import { resolveChargeAmount } from '@/lib/billing/charge-amount'

export interface TaxConfig {
  rates: { labor?: number; materials?: number; other?: number }
  default_rate?: number
}

export interface ComputeTotalsItem {
  quantity: number
  unit_price?: number        // MARK-01 — optional: absent when the AI supplies cost + markup_pct
                             // instead and the server derives the price (see :105-:109)
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
  // BILL-CONSTRAINT-01 (FIX 2): currency code driving the cents-space deposit
  // rounding (via resolveChargeAmount / toMinorUnits' minorUnit table). Absent →
  // 'USD' (byte-identical retrocompat for every existing USD caller — the ONLY
  // currency in use before this option existed).
  currencyCode?: string | null
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
  {
    taxRate,
    taxConfig,
    discountType,
    discountValue,
    depositType,
    depositValue,
    currencyCode,
  }: ComputeTotalsOptions
): ComputeTotalsResult {
  const resolvedCurrencyCode = currencyCode ?? 'USD'
  // WI-2 (HARDEN-GUARD-01): defensively coerce a negative / non-finite tax rate to 0 so the
  // engine never emits negative tax. A valid rate (finite, >=0) passes through unchanged ⇒
  // strict NO-OP for every existing test (their rates are all finite >=0).
  const safeTaxRate = Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 0

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
          : item.unit_price ?? 0
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
    // SAVE-07 server half (audit B8 corollary): the flat path previously taxed
    // the WHOLE subtotal regardless of any line's `taxable` flag, so the
    // taxable=false toggle was a silent no-op whenever the company has no
    // per-category tax_config (the common/default case — taxConfig is null
    // unless a company has opted into per-category tax rules). DELIBERATE
    // BEHAVIOR CHANGE: a taxable=false line now contributes ZERO to the flat
    // taxable base, mirroring the per-category branch's `if (!isTaxable)
    // continue` below.
    //
    // taxableSubtotal mirrors `subtotal`'s OWN two-level rounding (round each
    // section's taxable sum, THEN round the sum of those) so that when every
    // item is taxable (taxable defaults to true — the overwhelming default),
    // taxableSubtotal === subtotal EXACTLY, not just numerically close.
    const taxableSubtotal = Math.round(
      calculatedSections.reduce((sum, section) => {
        const sectionTaxableSum = section.items.reduce((s, item) => {
          const isTaxable = item.taxable ?? true
          return isTaxable ? s + item.total : s
        }, 0)
        return sum + Math.round(sectionTaxableSum * 100) / 100
      }, 0) * 100
    ) / 100

    // Prorate the global discount onto the taxable base by its share of the
    // overall subtotal (discount-before-tax, same principle as the
    // per-category branch's DISC-02 proration, generalized to a single
    // implicit "category" here). All-taxable → taxableSubtotal === subtotal →
    // proratedDisc === discGlobal → BYTE-IDENTICAL to the prior
    // `(subtotal - discGlobal) * safeTaxRate` expression.
    const proratedDisc =
      subtotal > 0 ? Math.round(discGlobal * (taxableSubtotal / subtotal) * 100) / 100 : 0

    // WI-2: safeTaxRate coerces a negative/non-finite rate to 0 (no-op on a valid rate).
    taxAmount = Math.round((taxableSubtotal - proratedDisc) * safeTaxRate * 100) / 100
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
            : safeTaxRate
      // WI-2: coerce the RESOLVED rate (a malformed negative category rate or default_rate) to
      // 0 so a category never contributes negative tax. Valid rates (>=0 finite) pass unchanged.
      const safeRate = Number.isFinite(rate) && rate >= 0 ? rate : 0
      const proratedDisc =
        taxableSubtotal > 0
          ? Math.round(discGlobal * (base / taxableSubtotal) * 100) / 100
          : 0
      const discountedBase = base - proratedDisc
      rawTax += discountedBase * safeRate
    }
    // SAME Math.round(x*100)/100 discipline as the flat path for byte-consistency.
    taxAmount = Math.round(rawTax * 100) / 100
  }

  // Pre-launch audit fix: floor grandTotal at 0, mirroring the existing
  // WI-2/HARDEN-GUARD-01 balanceDue floor below — a discount exceeding
  // subtotal+tax previously produced a negative grand total (and therefore a
  // negative balanceDue too, since balanceDue's own floor can't fix an
  // already-negative input consistently). Math.max(0, …) is a strict no-op
  // for every normal discount (<= subtotal+tax ⇒ already >= 0), so every
  // existing golden total is byte-identical.
  const grandTotal = Math.max(0, Math.round(((subtotal - discGlobal) + taxAmount) * 100) / 100)

  // DEP-01 (LOCKED sequence): deposit computed from grandTotal; balanceDue = grandTotal − deposit.
  // depositType absent / 'none' / null → deposit 0 → balanceDue = grandTotal (byte-identical retrocompat).
  // BILL-CONSTRAINT-01 (FIX 1 + FIX 2): 'percent'/'amount' now resolve through
  // resolveChargeAmount — the SAME integer-cents math the Stripe charge uses — then
  // convert back to major units. This is a single-authority reuse, not a duplicate
  // implementation: resolveChargeAmount already (a) rounds in cents (FIX 2 parity)
  // and (b) clamps the result to [0, totalCents] (FIX 1 clamp — a deposit can never
  // come back negative or exceed grandTotal, even from a malformed legacy row).
  // A valid deposit (<=grandTotal, percent<=100) round-trips byte-identical to the
  // prior dollar-space Math.round for every existing golden (both compute the same
  // cents when no floating-point half-cent tie is in play).
  const deposit =
    depositType === 'percent' || depositType === 'amount'
      ? fromMinorUnits(
          resolveChargeAmount(
            { total: grandTotal, deposit_type: depositType, deposit_value: depositValue ?? 0 },
            resolvedCurrencyCode
          ).chargeAmountCents,
          resolvedCurrencyCode
        )
      : 0
  // WI-2 (HARDEN-GUARD-01): floor balanceDue at 0 — now a pure no-op safety net, since
  // resolveChargeAmount already guarantees deposit <= grandTotal (kept for defense in
  // depth / byte-consistency with the pre-existing form).
  const balanceDue = Math.max(0, Math.round((grandTotal - deposit) * 100) / 100)

  return { sections: calculatedSections, subtotal, discountAmount: discGlobal, taxAmount, grandTotal, deposit, balanceDue }
}
