// lib/pdf/transcode-pdf-image.ts
//
// The ONE in-process "make these bytes something @react-pdf/image can draw"
// transcode. Extracted verbatim from lib/pdf/resolve-pdf-logo.ts by
// PDF-PHOTO-01, which needed the identical decode/encode step for job-site
// photos — a second copy would have been a second place for the format list,
// the never-throws contract and the `animated: false` frame-0 rule to drift.
//
// Both callers:
//   - lib/pdf/resolve-pdf-logo.ts  (PDF-LOGO-01) — company logo, {@link LogoSpec}
//   - lib/pdf/resolve-pdf-photos.ts (PDF-PHOTO-01) — job-site photos, {@link PhotoCellSpec}
//
// `sharp` is already a production dependency (package.json) and already runs on
// every logo AND photo upload via lib/image/webp.ts — nothing new is introduced.
// It is imported LAZILY so the native binding only loads on a render that
// genuinely needs a transcode.
//
// Contract: NEVER throws. Every failure — corrupt bytes, an unsupported codec, a
// sharp binding that failed to load — degrades to `null`, because a broken image
// must never cost the user their document.
import 'server-only'

/**
 * Logo: fit the whole mark INSIDE a square of `maxEdgePx` (never enlarging) and
 * keep alpha when the source has it — dropping it would paint a black box behind
 * a transparent mark. PNG when alpha, JPEG when not (materially smaller for a
 * photographic or solid-background logo).
 */
export interface LogoSpec {
  kind: 'logo'
  maxEdgePx: number
}

/**
 * Photo: the PDF photo grid draws every photo into a SQUARE cell with
 * `objectFit: 'cover'`, so anything outside that square crop is shipped into the
 * document and then thrown away by the renderer. This spec pre-applies the exact
 * same centre crop (sharp's `fit: 'cover'` default position is `centre`, as is
 * react-pdf's `objectFit: 'cover'`) at `cellEdgePx`, so the embedded image is the
 * smallest one that fills the cell at full quality and not one pixel more.
 *
 * Always JPEG: a PNG of a photograph is many times larger for no visible gain,
 * and a photo has no alpha worth preserving (any it does have is flattened onto
 * white, which is the page colour behind it).
 *
 * Never enlarges — a source smaller than the cell is cropped square at its own
 * size, exactly as today's undersized photos are scaled up by the renderer.
 */
export interface PhotoCellSpec {
  kind: 'photo-cell'
  cellEdgePx: number
  quality: number
}

export type TranscodeSpec = LogoSpec | PhotoCellSpec

/**
 * Decodes any raster `sharp` understands and re-encodes it as a png/jpeg `data:`
 * URI — the only two formats `@react-pdf/image` accepts (see
 * lib/pdf/pdf-image-support.ts for the cited source), on BOTH its data-URI and
 * its remote-URL path.
 *
 * Returns `null` on any failure. Callers MUST treat null as "draw nothing here"
 * and keep rendering.
 */
export async function transcodeToPdfSafeDataUri(
  source: Buffer,
  spec: TranscodeSpec
): Promise<string | null> {
  if (source.byteLength === 0) return null

  try {
    const { default: sharp } = await import('sharp')

    // `animated: false` (the default) takes frame 0 of an animated WebP/GIF — a
    // PDF has no animation to render anyway, and without it sharp would emit a
    // tall filmstrip of every frame.
    const metadata = await sharp(source).metadata()

    if (spec.kind === 'photo-cell') {
      // Clamp to the source's own shorter edge rather than passing
      // `withoutEnlargement` — with `fit: 'cover'` that flag's interaction with a
      // square target is version-dependent, whereas an explicit min() is exact
      // and gives a deterministic output size we can assert on.
      const shortestEdge = Math.min(metadata.width ?? 0, metadata.height ?? 0)
      if (shortestEdge <= 0) return null
      const edge = Math.min(spec.cellEdgePx, shortestEdge)

      const jpeg = await sharp(source)
        .resize({ width: edge, height: edge, fit: 'cover', position: 'centre' })
        // JPEG cannot carry alpha; sharp would otherwise composite onto BLACK.
        // The page behind the grid is white.
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: spec.quality, chromaSubsampling: '4:2:0' })
        .toBuffer()
      return `data:image/jpeg;base64,${jpeg.toString('base64')}`
    }

    const pipeline = sharp(source).resize({
      width: spec.maxEdgePx,
      height: spec.maxEdgePx,
      fit: 'inside',
      withoutEnlargement: true,
    })

    if (metadata.hasAlpha === true) {
      const png = await pipeline.png({ compressionLevel: 9 }).toBuffer()
      return `data:image/png;base64,${png.toString('base64')}`
    }
    const jpeg = await pipeline.jpeg({ quality: 90 }).toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    return null
  }
}
