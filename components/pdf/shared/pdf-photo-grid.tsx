// components/pdf/shared/pdf-photo-grid.tsx
//
// Phase 183 Plan 06 (PDFPAR-03 + ENGINE-03) — shared attached-photos grid for
// both PDF templates. Structure is byte-identical between Classic/Modern
// (label + wrapping flex-wrap row of photos); this is also the one change
// point that adds a per-photo caption, conditionally rendered beneath each
// image (no empty space when a photo has no caption).
//
// Phase 184 Plan 04 (PGBRK-02) — row-chunked via the SHARED `photosPerRow`
// (imported from lib/estimate/document/tokens.ts, Plan 184-01 — NOT defined
// here, so the client-safe pagination core never has to import from
// components/pdf/*). The grid now renders one `wrap={false}` View PER ROW
// (chunk), not one `wrap={false}` around the whole grid — the photo grid
// breaks only between visual rows, per the locked break rule. Only the FIRST
// row-chunk carries `marginTop: topMargin`; the "Photos" section label
// renders exactly once (`showLabel`), never repeated per row-chunk.
//
// The outer visibility gate (`isSectionVisible(resolvedSettings, 'photos') &&
// attachedPhotos && attachedPhotos.length > 0`) stays in each template file —
// only the inner grid JSX (label + photo rows) lives here.
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION (`PdfPhotoGrid({...})`), not JSX.

import { Fragment } from 'react'
import { View, Text, Image } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { DocumentLabels } from '@/lib/estimate/document/labels'
import { photosPerRow } from '@/lib/estimate/document/tokens'

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
  /** Applied ONLY to the first row-chunk's View — Classic uses 16, Modern uses 20 (existing per-template spacing, now applied per-row instead of to a since-removed outer wrapper). */
  topMargin: number
  /** Page content width in pt — drives row-chunking via the shared photosPerRow(contentWidthPt). Pass ESTIMATE_PAGE_GEOMETRY.<template>.contentWidthPt — never a bare literal. */
  contentWidthPt: number
  /** Whether to render the "Photos" section label (once, ahead of the first row-chunk). */
  showLabel?: boolean
  styles: PdfPhotoGridStyles
}

export function PdfPhotoGrid({
  photos,
  L,
  topMargin,
  contentWidthPt,
  showLabel,
  styles,
}: PdfPhotoGridProps) {
  const perRow = photosPerRow(contentWidthPt)
  const rows: PdfPhotoGridPhoto[][] = []
  for (let i = 0; i < photos.length; i += perRow) {
    rows.push(photos.slice(i, i + perRow))
  }

  return (
    <Fragment>
      {showLabel && <Text style={styles.termsTitle}>{L.photos}</Text>}
      {rows.map((rowPhotos, rowIdx) => (
        <View
          key={`row-${rowIdx}`}
          wrap={false}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: rowIdx === 0 ? topMargin : 8,
          }}
        >
          {rowPhotos.map((photo, i) => (
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
      ))}
    </Fragment>
  )
}
