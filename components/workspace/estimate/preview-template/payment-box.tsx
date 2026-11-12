// components/workspace/estimate/preview-template/payment-box.tsx
//
// The Payment box (deposit due now + balance due, apart from the price) in the
// paginated preview — the PDF's pdf-totals-block.tsx box restated in px from
// the SAME tokens.ts PAYMENT_BOX numbers, so the preview, the PDF and the
// pagination height (paymentBoxHeightPt) agree. Rows are tighter than a
// totals row and unruled, like the PDF's box rows.
import type { CSSProperties } from 'react'
import { formatPercent } from '@/lib/estimate/document/format'
import { LINE_HEIGHT, ESTIMATE_DESIGN_TOKENS, PAYMENT_BOX } from '@/lib/estimate/document/tokens'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import { font, pt, tracking } from './units'
import type { RenderCtx } from './types'

export function PaymentBoxView({
  ctx,
  template,
  mutedClassName,
}: {
  ctx: RenderCtx
  template: EstimateTemplateId
  mutedClassName: string
}) {
  const { data, L, fmt, dep } = ctx
  const box = PAYMENT_BOX[template]
  const titleLineHeight = LINE_HEIGHT[ESTIMATE_DESIGN_TOKENS[template].fontFamilyBold]
  const rowClassName = 'flex justify-between'
  const rowStyle: CSSProperties = {
    ...font(box.rowFontSizePt, LINE_HEIGHT[ESTIMATE_DESIGN_TOKENS[template].fontFamily]),
    paddingTop: pt(box.rowPaddingVerticalPt),
    paddingBottom: pt(box.rowPaddingVerticalPt),
  }
  const depositPct =
    data.deposit_type === 'percent' && data.deposit_value ? ` (${formatPercent(data.deposit_value)})` : ''

  return (
    <div
      data-testid="totals-payment-box"
      style={{
        marginTop: pt(box.marginTopPt),
        marginLeft: -pt(box.paddingHorizontalPt),
        marginRight: -pt(box.paddingHorizontalPt),
        paddingTop: pt(box.paddingVerticalPt),
        paddingBottom: pt(box.paddingVerticalPt),
        paddingLeft: pt(box.paddingHorizontalPt),
        paddingRight: pt(box.paddingHorizontalPt),
        backgroundColor: box.fill,
        borderRadius: pt(box.radiusPt),
      }}
    >
      <p
        className="font-bold uppercase select-none"
        style={{
          ...font(box.titleFontSizePt, titleLineHeight),
          ...tracking(box.titleLetterSpacingPt),
          color: '#71717a',
          marginBottom: pt(box.titleMarginBottomPt),
        }}
      >
        {L.payment}
      </p>
      <div className={rowClassName} style={rowStyle}>
        <span className={`${mutedClassName} select-none`}>
          {L.depositRequired}
          {depositPct}
        </span>
        <span>{fmt(dep.depositAmount)}</span>
      </div>
      <div className={rowClassName} style={rowStyle}>
        <span className="font-bold select-none">{L.balanceDue}</span>
        <span className="font-bold">{fmt(dep.balanceDue)}</span>
      </div>
    </div>
  )
}
