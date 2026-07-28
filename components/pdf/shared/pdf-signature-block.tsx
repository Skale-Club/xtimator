// components/pdf/shared/pdf-signature-block.tsx
//
// Phase 183 Plan 06 (PDFPAR-02, net-new) — the one signature-block renderer
// both PDF templates mount, reading a data: URI straight into react-pdf's
// <Image>. Gated purely on data presence (no presentation_settings key exists
// for it, per CONTEXT.md's locked rule — an unsigned estimate shows NO
// signature block, no placeholder). Positioned between Terms and Photos in
// both templates, matching the webview's Plan 183-05 placement
// (components/workspace/estimate/estimate-document.tsx).
//
// `wrap={false}` keeps the whole block on one page — it is defined as one
// atomic, unsplittable unit (Phase 184's later pagination work depends on
// this).
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION (`{PdfSignatureBlock({...})}`), not JSX.

import { View, Text, Image } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { DocumentSignature } from '@/lib/estimate/document/model'
import type { DocumentLabels } from '@/lib/estimate/document/labels'

export interface PdfSignatureBlockStyles {
  termsTitle: Style
}

export interface PdfSignatureBlockProps {
  signature: DocumentSignature | null
  L: DocumentLabels
  fmtDate: (s: string) => string
  /** Phase 186 Plan 02 (POLISH-01) — optional subtle brand-tint background,
   * sourced from lib/estimate/document/tokens.ts's cardTintFill(). Classic
   * only; Modern's call site never passes this, keeping Modern fill-free by
   * omission. background-color ONLY — never touches margin/font-size (those
   * drive lib/estimate/pagination/blocks-from-model.ts's signatureBaseHeightPt
   * formula; this prop must stay geometry-inert). */
  cardFill?: string
  styles: PdfSignatureBlockStyles
}

export function PdfSignatureBlock({ signature, L, fmtDate, cardFill, styles }: PdfSignatureBlockProps) {
  if (!signature) return null

  return (
    <View style={{ marginTop: 16, ...(cardFill ? { backgroundColor: cardFill } : {}) }} wrap={false}>
      <Text style={styles.termsTitle}>{L.signedBy}</Text>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image
        src={signature.signatureDataUrl}
        style={{ width: 150, height: 40, objectFit: 'contain' }}
      />
      <Text style={{ fontSize: 9, marginTop: 4 }}>{signature.signerName}</Text>
      <Text style={{ fontSize: 9, color: '#6b7280' }}>{fmtDate(signature.signedAt)}</Text>
    </View>
  )
}
