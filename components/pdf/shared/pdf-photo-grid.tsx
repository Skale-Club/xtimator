// components/pdf/shared/pdf-photo-grid.tsx
//
// Phase 183 Plan 06 (PDFPAR-03 + ENGINE-03) — shared attached-photos grid for
// both PDF templates. Structure is byte-identical between Classic/Modern
// (label + wrapping flex-wrap row of photos); this is also the one change
// point that adds a per-photo caption, conditionally rendered beneath each
// image (no empty space when a photo has no caption).
//
// The outer visibility gate (`isSectionVisible(resolvedSettings, 'photos') &&
// attachedPhotos && attachedPhotos.length > 0`) stays in each template file —
// only the inner grid JSX (label + photo row) lives here.
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION (`PdfPhotoGrid({...})`), not JSX.

import { View, Text, Image } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { DocumentLabels } from '@/lib/estimate/document/labels'

export interface PdfPhotoGridPhoto {
  url: string
  caption: string | null
}

export interface PdfPhotoGridStyles {
  termsTitle: Style
}

export interface PdfPhotoGridProps {
  photos: PdfPhotoGridPhoto[]
  L: DocumentLabels
  /** Outer wrapper's marginTop — Classic uses 16, Modern uses 20 (existing
   * per-template spacing, preserved exactly from before this extraction). */
  topMargin: number
  styles: PdfPhotoGridStyles
}

export function PdfPhotoGrid({ photos, L, topMargin, styles }: PdfPhotoGridProps) {
  return (
    <View style={{ marginTop: topMargin }} wrap={false}>
      <Text style={styles.termsTitle}>{L.photos}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        {photos.map((photo, i) => (
          <View key={i} style={{ width: 150 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={photo.url} style={{ width: 150, height: 150, objectFit: 'cover' }} />
            {photo.caption && (
              <Text style={{ fontSize: 8, marginTop: 2, color: '#6b7280' }}>
                {photo.caption}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  )
}
