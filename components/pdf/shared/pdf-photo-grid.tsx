// components/pdf/shared/pdf-photo-grid.tsx
//
// Phase 183 Plan 06 (PDFPAR-03 + ENGINE-03) — shared attached-photos grid for
// both PDF templates. Structure is byte-identical between Classic/Modern
// (label + row of photos); this is also the one change
// point that adds a per-photo caption, conditionally rendered beneath each
// image (no empty space when a photo has no caption).
//
// Phase 184 Plan 04 (PGBRK-02) — row-chunked via the SHARED `photosPerRow`
// (imported from lib/estimate/document/tokens.ts, Plan 184-01 — NOT defined
// here, so the client-safe pagination core never has to import from
// components/pdf/*). The grid now renders one `wrap={false}` View PER ROW
// (chunk), not one `wrap={false}` around the whole grid — the photo grid
// breaks only between visual rows, per the locked break rule. Every chunk's
// View carries `marginTop: topMargin` (see the spacing note below); the "Photos"
// section label renders exactly once (`showLabel`), inside the first chunk's
// View, never repeated per row-chunk.
//
// The outer visibility gate (`isSectionVisible(resolvedSettings, 'photos') &&
// attachedPhotos && attachedPhotos.length > 0`) stays in each template file —
// only the inner grid JSX (label + photo rows) lives here.
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION (`PdfPhotoGrid({...})`), not JSX.
//
// PDF-PHOTO-01 — this component draws whatever it is handed and applies NO
// drawability gate of its own, deliberately. The gate (`drawablePdfPhotos`,
// lib/pdf/pdf-image-support.ts) must be applied by the CALLER to the FULL photo
// array before it is sliced by `PageBlock.ref.photoRange`, because that range is
// a pair of indexes: filtering here, after the slice, would silently disagree
// with the index domain the pagination engine measured. See that helper's
// docblock.
//
// Tile size: each row spans the FULL content width. The tile is a square of
// `photoTileWidthPt(contentWidthPt)` (shared token fn, lib/estimate/document/
// tokens.ts) — (content - gap x (perRow - 1)) / perRow — and that same function
// is what blocks-from-model.ts charges as the photo-row height.
// lib/pdf/resolve-pdf-photos.ts downscales to PHOTO_TILE_MAX_WIDTH_PT, the
// largest tile of any template, so the embedded pixels always cover this size.
//
// Vertical spacing (all of it lives INSIDE the row's own wrap={false} View, so a
// row, its label and its margin are one atomic unit that can never be split from
// each other by react-pdf): `topMargin` is the row View's marginTop — the gap
// ABOVE the "Photos" label on the first chunk (16 Classic / 20 Modern), the
// inter-row gap on later chunks. The label sits inside that View, above the tiles.

import { Fragment } from 'react'
import { View, Text, Image } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { DocumentLabels } from '@/lib/estimate/document/labels'
import { photosPerRow, photoTileWidthPt, PHOTO_TILE_GAP_PT } from '@/lib/estimate/document/tokens'

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
  /** marginTop of this chunk's row View. First chunk: the space ABOVE the "Photos" label (Classic 16 / Modern 20). Later chunks: PHOTO_TILE_GAP_PT (the gap between consecutive photo rows). */
  topMargin: number
  /** Page content width in pt — drives row-chunking via the shared photosPerRow(contentWidthPt) and the tile size via photoTileWidthPt(contentWidthPt). Pass ESTIMATE_PAGE_GEOMETRY.<template>.contentWidthPt — never a bare literal. */
  contentWidthPt: number
  /** Whether to render the "Photos" section label (once, at the top of the first row-chunk's View). */
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
  const tilePt = photoTileWidthPt(contentWidthPt)
  const rows: PdfPhotoGridPhoto[][] = []
  for (let i = 0; i < photos.length; i += perRow) {
    rows.push(photos.slice(i, i + perRow))
  }

  return (
    <Fragment>
      {rows.map((rowPhotos, rowIdx) => (
        <View
          key={`row-${rowIdx}`}
          wrap={false}
          style={{ marginTop: rowIdx === 0 ? topMargin : PHOTO_TILE_GAP_PT }}
        >
          {showLabel && rowIdx === 0 && <Text style={styles.termsTitle}>{L.photos}</Text>}
          <View style={{ flexDirection: 'row', gap: PHOTO_TILE_GAP_PT }}>
            {rowPhotos.map((photo, i) => (
              <View key={i} style={{ width: tilePt }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image
                  src={photo.url}
                  style={{ width: tilePt, height: tilePt, objectFit: 'cover' }}
                />
                {photo.caption && (
                  <Text style={{ fontSize: 8, marginTop: 2, color: '#6b7280' }}>
                    {photo.caption}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </View>
      ))}
    </Fragment>
  )
}
