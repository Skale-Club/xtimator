// components/pdf/shared/pdf-section-block.tsx
//
// Phase 183 Plan 04 (ENGINE-03) — one section: header + table header + item
// rows (zebra striping unchanged) + section subtotal. Classic's header gets a
// solid brand-fill (UNCHANGED behavior, just relocated); Modern's header has
// no dynamic override at all (UNCHANGED — a static borderBottom rule lives in
// its own StyleSheet).
//
// Phase 184 Plan 04 (PGBRK-02) — split into 4 independently-placeable,
// individually-keyed pieces (PdfSectionHeader / PdfTableHeaderOnly /
// PdfSectionRows / PdfSectionSubtotal) so a section CAN span a page boundary
// (Plan 184-05 wires the real per-page slicing). Calling all 4 in sequence,
// per section, with `startIndex: 0`, reproduces today's single-page tree
// byte-for-byte — see tests/unit/pdf/estimate-pdf-baseline-order.test.tsx.
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call these as PLAIN FUNCTIONS (not JSX), e.g.
// `sections.map((section) => [PdfSectionHeader({...}), PdfTableHeaderOnly({...}), PdfSectionRows({...}), PdfSectionSubtotal({...})])`.
// Because these are function calls (not React.createElement via JSX), and
// the 4 pieces are combined as SIBLING ARRAY ITEMS per section, each one sets
// its OWN root element's `key` (via the `sectionId` prop) rather than relying
// on a single section-level key on an outer wrapper (which no longer exists).

import { Fragment } from 'react'
import { View, Text } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { DocumentItem } from '@/lib/estimate/document/model'
import type { DocumentLabels } from '@/lib/estimate/document/labels'

export interface PdfSectionBlockStyles {
  sectionHeader: Style
  sectionTitle: Style
  tableHeader: Style
  tableRow: Style
  tableRowAlt: Style
  colDescription: Style
  colQty: Style
  colUnit: Style
  colUnitPrice: Style
  colTotal: Style
  tableHeaderText: Style
  tableCellText: Style
  sectionSubtotal: Style
  sectionSubtotalLabel: Style
  sectionSubtotalValue: Style
}

export interface PdfSectionHeaderProps {
  sectionId: string
  title: string
  /** Drives the section-header fill-vs-no-fill branch. Pass ESTIMATE_DESIGN_TOKENS.<template>.solidHeaderFill — never hardcode. */
  solidFill: boolean
  brandColor: string
  brandOnFill: string
  /** Title text colour when there is NO solid fill (Modern passes brandText — the
   * readable-on-white brand colour). Ignored when solidFill (the title then uses
   * brandOnFill over the brand band). Omit to keep styles.sectionTitle's own colour. */
  titleColor?: string
  /** When set, this is the CONTINUATION header drawn at the top of a page that
   * opens mid-section (PageAssignment.continuesTable): the title is followed by
   * this localized suffix (L.continued, e.g. "(cont.)") and the whole title is
   * forced to ONE line — the title Text is capped at 80% of the band with
   * maxLines 1 + ellipsis (react-pdf takes maxLines/textOverflow as style props;
   * maxWidth is load-bearing, a Text never shrinks below its unwrapped width) so a
   * long section name is cut with "…" while the suffix always stays visible, and
   * the band is exactly one line tall — which is what
   * lib/pdf/measure-header-height.ts's CONTINUATION_SECTION_TITLE_HEIGHT_PT
   * charges. marginTop is also dropped to 0: the compact page header above
   * already carries its own marginBottom, so the section band's usual leading
   * space would double up. */
  continuedLabel?: string
  styles: Pick<PdfSectionBlockStyles, 'sectionHeader' | 'sectionTitle'>
}

export function PdfSectionHeader({
  sectionId,
  title,
  solidFill,
  brandColor,
  brandOnFill,
  titleColor,
  continuedLabel,
  styles,
}: PdfSectionHeaderProps) {
  const textColor = solidFill ? brandOnFill : titleColor
  const titleStyle = textColor ? [styles.sectionTitle, { color: textColor }] : styles.sectionTitle
  if (continuedLabel) {
    const bandBase = [styles.sectionHeader, { marginTop: 0 }]
    const titleParts: Style[] = [styles.sectionTitle, ...(textColor ? [{ color: textColor }] : [])]
    return (
      <View
        key={`${sectionId}-cont-header`}
        style={solidFill ? [...bandBase, { backgroundColor: brandColor }] : bandBase}
      >
        <View style={{ flexDirection: 'row' }}>
          <Text style={[...titleParts, { maxWidth: '80%', maxLines: 1, textOverflow: 'ellipsis' }]}>{title}</Text>
          <Text style={[...titleParts, { marginLeft: 4 }]}>{continuedLabel}</Text>
        </View>
      </View>
    )
  }
  return (
    <View
      key={`${sectionId}-header`}
      style={solidFill ? [styles.sectionHeader, { backgroundColor: brandColor }] : styles.sectionHeader}
    >
      <Text style={titleStyle}>{title}</Text>
    </View>
  )
}

export interface PdfTableHeaderOnlyProps {
  /** Used purely for the React key — the visual content has zero dependency
   * on any specific section (Plan 184-05's continuation-page usage passes a
   * different contextual id, e.g. derived from the page/section being
   * continued). */
  sectionId: string
  L: DocumentLabels
  styles: Pick<
    PdfSectionBlockStyles,
    'tableHeader' | 'tableHeaderText' | 'colDescription' | 'colQty' | 'colUnit' | 'colUnitPrice' | 'colTotal'
  >
}

export function PdfTableHeaderOnly({ sectionId, L, styles }: PdfTableHeaderOnlyProps) {
  return (
    <View key={`${sectionId}-thead`} style={styles.tableHeader}>
      <Text style={[styles.tableHeaderText, styles.colDescription]}>
        {L.description}
      </Text>
      <Text style={[styles.tableHeaderText, styles.colQty]}>{L.qty}</Text>
      <Text style={[styles.tableHeaderText, styles.colUnit]}>{L.unit}</Text>
      <Text style={[styles.tableHeaderText, styles.colUnitPrice]}>
        {L.unitPrice}
      </Text>
      <Text style={[styles.tableHeaderText, styles.colTotal]}>{L.total}</Text>
    </View>
  )
}

export interface PdfSectionRowsProps {
  sectionId: string
  items: DocumentItem[]
  /** Zebra striping is computed as `(idx + startIndex) % 2`, NOT `idx % 2` —
   * so a slice starting mid-section (continuation page, Plan 184-05)
   * preserves the correct alternating-row pattern relative to the section's
   * FULL item list. Pass 0 for a section's own first (or only) page. */
  startIndex: number
  fmt: (v: number) => string
  styles: Pick<
    PdfSectionBlockStyles,
    'tableRow' | 'tableRowAlt' | 'colDescription' | 'colQty' | 'colUnit' | 'colUnitPrice' | 'colTotal' | 'tableCellText'
  >
}

export function PdfSectionRows({ sectionId, items, startIndex, fmt, styles }: PdfSectionRowsProps) {
  return (
    <Fragment key={`${sectionId}-rows`}>
      {items.map((item, idx) => (
        <View
          key={item.id}
          style={[styles.tableRow, (idx + startIndex) % 2 === 1 ? styles.tableRowAlt : {}]}
        >
          <Text style={[styles.tableCellText, styles.colDescription]}>
            {item.description}
          </Text>
          <Text style={[styles.tableCellText, styles.colQty]}>
            {item.quantity}
          </Text>
          <Text style={[styles.tableCellText, styles.colUnit]}>
            {item.unit ?? ''}
          </Text>
          <Text style={[styles.tableCellText, styles.colUnitPrice]}>
            {fmt(item.unit_price)}
          </Text>
          <Text style={[styles.tableCellText, styles.colTotal]}>
            {fmt(item.total)}
          </Text>
        </View>
      ))}
    </Fragment>
  )
}

export interface PdfSectionSubtotalProps {
  sectionId: string
  label: string
  /** Already-formatted money string (caller applies `fmt(section.subtotal)`). */
  value: string
  styles: Pick<PdfSectionBlockStyles, 'sectionSubtotal' | 'sectionSubtotalLabel' | 'sectionSubtotalValue'>
}

export function PdfSectionSubtotal({ sectionId, label, value, styles }: PdfSectionSubtotalProps) {
  return (
    <View key={`${sectionId}-subtotal`} style={styles.sectionSubtotal}>
      <Text style={styles.sectionSubtotalLabel}>{label}</Text>
      <Text style={styles.sectionSubtotalValue}>{value}</Text>
    </View>
  )
}
