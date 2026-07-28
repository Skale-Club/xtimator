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
  styles: Pick<PdfSectionBlockStyles, 'sectionHeader' | 'sectionTitle'>
}

export function PdfSectionHeader({
  sectionId,
  title,
  solidFill,
  brandColor,
  brandOnFill,
  styles,
}: PdfSectionHeaderProps) {
  return (
    <View
      key={`${sectionId}-header`}
      style={
        solidFill
          ? [styles.sectionHeader, { backgroundColor: brandColor }]
          : styles.sectionHeader
      }
    >
      <Text
        style={
          solidFill
            ? [styles.sectionTitle, { color: brandOnFill }]
            : styles.sectionTitle
        }
      >
        {title}
      </Text>
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
