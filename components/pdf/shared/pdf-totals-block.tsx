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

import { View, Text } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { isPercentageDiscount } from '@/lib/estimate/discount-display'
import type { DepositDisplay } from '@/lib/estimate/deposit-display'
import type { DocumentLabels } from '@/lib/estimate/document/labels'

export interface PdfTotalsBlockEstimate {
  subtotal: number
  discount_amount: number
  discount_type: string | null
  discount_value: number
  tax_amount: number
  tax_rate: number
  total: number
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
        {isPercentageDiscount(estimate.discount_type) ? ` (${estimate.discount_value}%)` : ''}
      </Text>
      <Text style={[styles.totalsValue, { color: '#dc2626' }]}>
        -{fmt(estimate.discount_amount)}
      </Text>
    </View>
  )

  const taxRow = estimate.tax_amount > 0 && (
    <View style={styles.totalsRow}>
      <Text style={styles.totalsLabel}>
        {L.tax} ({(estimate.tax_rate * 100).toFixed(2)}%)
      </Text>
      <Text style={styles.totalsValue}>{fmt(estimate.tax_amount)}</Text>
    </View>
  )

  if (variant === 'classic') {
    return (
      <View style={styles.totalsContainer}>
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

          {/* PUI-02 (v4.11): deposit + balance due — only when a deposit is set.
              Locked order: Subtotal → Discount → Tax → Total → Deposit → Balance Due. */}
          {dep.showDeposit && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{L.deposit}</Text>
              <Text style={styles.totalsValue}>-{fmt(dep.depositAmount)}</Text>
            </View>
          )}

          {dep.showDeposit && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{L.balanceDue}</Text>
              <Text style={styles.totalsValue}>{fmt(dep.balanceDue)}</Text>
            </View>
          )}
        </View>
      </View>
    )
  }

  // variant === 'modern'
  return (
    <View style={styles.totalsContainer}>
      <View style={styles.totalsBlock}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>{L.subtotal}</Text>
          <Text style={styles.totalsValue}>{fmt(estimate.subtotal)}</Text>
        </View>

        {discountRow}
        {taxRow}

        {/* Hero total — large standalone number, own block, no border-top table row */}
        <View style={styles.grandTotalBlock}>
          <Text style={styles.grandTotalLabel}>{L.grandTotal}</Text>
          <Text style={[styles.grandTotalValue, { color: brandText }]}>
            {fmt(estimate.total)}
          </Text>
        </View>

        {/* PUI-02 (v4.11): deposit + balance due — only when a deposit is set.
            Locked order: Subtotal → Discount → Tax → Total → Deposit → Balance Due. */}
        {dep.showDeposit && (
          <View style={[styles.totalsRow, { marginTop: 16 }]}>
            <Text style={styles.totalsLabel}>{L.deposit}</Text>
            <Text style={styles.totalsValue}>-{fmt(dep.depositAmount)}</Text>
          </View>
        )}

        {dep.showDeposit && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{L.balanceDue}</Text>
            <Text style={styles.totalsValue}>{fmt(dep.balanceDue)}</Text>
          </View>
        )}
      </View>
    </View>
  )
}
