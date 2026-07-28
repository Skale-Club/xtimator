// components/pdf/shared/pdf-section-block.tsx
//
// Phase 183 Plan 04 (ENGINE-03) — one section: header + table header + item
// rows (zebra striping unchanged) + section subtotal. Classic's header gets a
// solid brand-fill (UNCHANGED behavior, just relocated); Modern's header has
// no dynamic override at all (UNCHANGED — a static borderBottom rule lives in
// its own StyleSheet).
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION inside `.map(...)` (not JSX), e.g.
// `sections.map((section) => PdfSectionBlock({ section, ... }))`. Because
// this is a function call (not React.createElement via JSX), React's
// list-reconciliation `key` must be set on the OUTERMOST element PdfSectionBlock
// itself returns — done below via `key={section.id}` on the wrapping <View>.

import { View, Text } from '@react-pdf/renderer'
import type { DocumentSection } from '@/lib/estimate/document/model'
import type { DocumentLabels } from '@/lib/estimate/document/labels'

export interface PdfSectionBlockStyles {
  sectionHeader: object
  sectionTitle: object
  tableHeader: object
  tableRow: object
  tableRowAlt: object
  colDescription: object
  colQty: object
  colUnit: object
  colUnitPrice: object
  colTotal: object
  tableHeaderText: object
  tableCellText: object
  sectionSubtotal: object
  sectionSubtotalLabel: object
  sectionSubtotalValue: object
}

export interface PdfSectionBlockProps {
  section: DocumentSection
  /** Drives the section-header fill-vs-no-fill branch. Pass ESTIMATE_DESIGN_TOKENS.<template>.solidHeaderFill — never hardcode. */
  solidFill: boolean
  brandColor: string
  brandOnFill: string
  L: DocumentLabels
  fmt: (v: number) => string
  styles: PdfSectionBlockStyles
}

export function PdfSectionBlock({
  section,
  solidFill,
  brandColor,
  brandOnFill,
  L,
  fmt,
  styles,
}: PdfSectionBlockProps) {
  return (
    <View key={section.id} wrap>
      <View
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
          {section.title}
        </Text>
      </View>

      {/* Table Header */}
      <View style={styles.tableHeader}>
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

      {/* Table Rows */}
      {section.items.map((item, idx) => (
        <View
          key={item.id}
          style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}
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

      {/* Section Subtotal */}
      <View style={styles.sectionSubtotal}>
        <Text style={styles.sectionSubtotalLabel}>{L.sectionSubtotal}</Text>
        <Text style={styles.sectionSubtotalValue}>{fmt(section.subtotal)}</Text>
      </View>
    </View>
  )
}
