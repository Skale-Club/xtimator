// components/pdf/shared/pdf-totals-block.tsx
//
// Phase 183 Plan 06 (ENGINE-03) — shared totals block for both PDF templates.
// Pitfall 2: Classic and Modern are GENUINELY different designs here, not
// incidental style variance — Classic's grand total is a boxed row inside the
// same bordered totalsBlock (`grandTotalRow`, border-top 2px), while Modern's
// grand total is a large standalone hero block (`grandTotalBlock`, fontSize
// 30, its own margin, no border). The `variant` prop branches to two distinct
// JSX trees below — do NOT collapse them into one tree parameterized only by
// style tokens.
//
// Row order also differs deliberately: Classic is
//   Subtotal -> Discount -> Tax -> [boxed] Total -> Deposit -> Balance Due
// Modern is
//   Subtotal -> Discount -> Tax -> [hero] Total -> Deposit -> Balance Due
// (Modern's hero total sits between Tax and Deposit exactly as it did before
// this extraction — preserved verbatim, not reordered to match Classic.)
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION (`{PdfTotalsBlock({...})}`), not JSX.
//
// Phase 184 Plan 04 (PGBRK-02) — outer totalsContainer is now explicitly
// `wrap={false}` in BOTH branches, closing a real pre-existing atomicity gap
// (previously relied on default Yoga wrap, which is NOT the same as an
// atomic block per the locked break rule: "totals block atomic").

import { View, Text } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { isPercentageDiscount } from '@/lib/estimate/discount-display'
import type { DepositDisplay } from '@/lib/estimate/deposit-display'
import { formatPercent } from '@/lib/estimate/document/format'
import type { DocumentLabels } from '@/lib/estimate/document/labels'
import { ESTIMATE_DESIGN_TOKENS, PAYMENT_BOX } from '@/lib/estimate/document/tokens'

export interface PdfTotalsBlockEstimate {
  subtotal: number
  discount_amount: number
  discount_type: string | null
  discount_value: number
  tax_amount: number
  tax_rate: number
  total: number
  /** For the "(30%)" on a percent deposit; optional for older callers. */
  deposit_type?: string | null
  deposit_value?: number | null
}

export interface PdfTotalsBlockStyles {
  totalsContainer: Style
  totalsBlock: Style
  totalsRow: Style
  totalsLabel: Style
  totalsValue: Style
  grandTotalLabel: Style
  grandTotalValue: Style
  /** Classic only — bordered box wrapping the grand total row. */
  grandTotalRow?: Style
  /** Modern only — standalone hero block wrapping the grand total. */
  grandTotalBlock?: Style
}

export interface PdfTotalsBlockProps {
  variant: 'classic' | 'modern'
  estimate: PdfTotalsBlockEstimate
  dep: DepositDisplay
  L: DocumentLabels
  brandText: string
  fmt: (v: number) => string
  styles: PdfTotalsBlockStyles
}

export function PdfTotalsBlock({
  variant,
  estimate,
  dep,
  L,
  brandText,
  fmt,
  styles,
}: PdfTotalsBlockProps) {
  const discountRow = estimate.discount_amount > 0 && (
    <View style={styles.totalsRow}>
      <Text style={styles.totalsLabel}>
        {L.discount}
        {isPercentageDiscount(estimate.discount_type) ? ` (${formatPercent(estimate.discount_value)})` : ''}
      </Text>
      {/* Normal color in every rendering: red read as an error. */}
      <Text style={styles.totalsValue}>-{fmt(estimate.discount_amount)}</Text>
    </View>
  )

  const taxRow = estimate.tax_amount > 0 && (
    <View style={styles.totalsRow}>
      <Text style={styles.totalsLabel}>
        {L.tax} ({formatPercent(estimate.tax_rate * 100)})
      </Text>
      <Text style={styles.totalsValue}>{fmt(estimate.tax_amount)}</Text>
    </View>
  )

  // Payment box: deposit due now and the balance, apart from the price (the
  // same box as the editor, the web document and the share page). Its rows are
  // tighter and unruled; blocks-from-model.ts charges tokens.ts
  // paymentBoxHeightPt for the whole box.
  const box = PAYMENT_BOX[variant]
  const boxRow = [styles.totalsRow, { paddingVertical: box.rowPaddingVerticalPt, borderBottomWidth: 0 }]
  const depositPct =
    estimate.deposit_type === 'percent' && estimate.deposit_value
      ? ` (${formatPercent(estimate.deposit_value)})`
      : ''
  const paymentBox = dep.showDeposit && (
    <View
      style={{
        marginTop: box.marginTopPt,
        marginHorizontal: -box.paddingHorizontalPt,
        paddingVertical: box.paddingVerticalPt,
        paddingHorizontal: box.paddingHorizontalPt,
        backgroundColor: box.fill,
        borderRadius: box.radiusPt,
      }}
    >
      <Text
        style={{
          fontFamily: ESTIMATE_DESIGN_TOKENS[variant].fontFamilyBold,
          fontSize: box.titleFontSizePt,
          letterSpacing: box.titleLetterSpacingPt,
          textTransform: 'uppercase',
          color: '#71717a',
          marginBottom: box.titleMarginBottomPt,
        }}
      >
        {L.payment}
      </Text>
      <View style={boxRow}>
        <Text style={styles.totalsLabel}>
          {L.depositRequired}
          {depositPct}
        </Text>
        <Text style={styles.totalsValue}>{fmt(dep.depositAmount)}</Text>
      </View>
      <View style={boxRow}>
        <Text style={[styles.totalsLabel, { fontFamily: ESTIMATE_DESIGN_TOKENS[variant].fontFamilyBold, color: '#111827' }]}>
          {L.balanceDue}
        </Text>
        <Text style={[styles.totalsValue, { fontFamily: ESTIMATE_DESIGN_TOKENS[variant].fontFamilyBold }]}>
          {fmt(dep.balanceDue)}
        </Text>
      </View>
    </View>
  )

  if (variant === 'classic') {
    return (
      <View style={styles.totalsContainer} wrap={false}>
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{L.subtotal}</Text>
            <Text style={styles.totalsValue}>{fmt(estimate.subtotal)}</Text>
          </View>

          {discountRow}
          {taxRow}

          <View style={styles.grandTotalRow}>
            <Text style={[styles.grandTotalLabel, { color: brandText }]}>
              {L.grandTotal}
            </Text>
            <Text style={[styles.grandTotalValue, { color: brandText }]}>
              {fmt(estimate.total)}
            </Text>
          </View>

          {/* PUI-02 (v4.11): deposit + balance due — only when a deposit is set,
              in the Payment box. Order: Subtotal → Discount → Tax → Total → Payment. */}
          {paymentBox}
        </View>
      </View>
    )
  }

  // variant === 'modern'
  return (
    <View style={styles.totalsContainer} wrap={false}>
      <View style={styles.totalsBlock}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>{L.subtotal}</Text>
          <Text style={styles.totalsValue}>{fmt(estimate.subtotal)}</Text>
        </View>

        {discountRow}
        {taxRow}

        {/* Total (2026-11-12): one row under a brand rule — label left, amount right */}
        <View style={[styles.grandTotalBlock as Style, { borderTopColor: brandText }]}>
          <Text style={styles.grandTotalLabel}>{L.grandTotal}</Text>
          <Text style={[styles.grandTotalValue, { color: brandText }]}>
            {fmt(estimate.total)}
          </Text>
        </View>

        {/* PUI-02 (v4.11): deposit + balance due — only when a deposit is set,
            in the Payment box (its marginTop replaces the old 16pt row margin). */}
        {paymentBox}
      </View>
    </View>
  )
}
