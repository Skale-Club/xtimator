// lib/pdf/resolve-pdf-logo.ts
//
// PDF-LOGO-01 — makes a stored company logo actually appear in a generated PDF.
//
// `lib/storage/asset-inline.ts`'s `resolveAssetForRenderer()` solves ORIGIN
// (react-pdf runs in Node and cannot fetch `/storage/logos/...`). It does not
// solve FORMAT: it faithfully emits `data:image/webp;base64,...` for the WebP
// every logo writer stores, and `@react-pdf/image` decodes only jpg/jpeg/png
// (see lib/pdf/pdf-image-support.ts for the cited source). This module is the
// format half — the PDF-only wrapper that hands react-pdf something it can draw.
//
// --- Why transcode in-process instead of storing a PNG variant ---
//
// The alternative was: dual-write a `logo.png` next to the WebP in all four
// writers, and have this resolver prefer it. Rejected because
//
//   1. **Existing logos.** Production has live rows TODAY at stable keys
//      (`{companyId}/logo.webp`, upserted). A variant-only fix renders nothing
//      for them until someone re-uploads — a half-fix — so it needs a backfill
//      job over the `logos` bucket AND a fallback path for any object the
//      backfill missed. That fallback IS this transcode, so the variant approach
//      is strictly this code PLUS a migration, four writer changes and a second
//      key convention that can drift from the first.
//   2. **No new dependency.** `sharp` is already a production dependency
//      (package.json `^0.34.5`) and already runs on every logo UPLOAD via
//      `lib/image/webp.ts`. Nothing new is introduced or shipped.
//   3. **The CPU cost is small and bounded.** One decode + one encode of an
//      image capped at {@link MAX_INLINE_BYTES} in asset-inline (2 MB) and
//      downscaled to {@link MAX_LOGO_EDGE_PX} here, against a render that
//      already loads embedded fonts, runs fontkit measurement over every line of
//      the document and lays out N pages through Yoga.
//
// Deliberately NOT cached: logo keys are STABLE (`{companyId}/logo.webp`,
// `upsert: true`), so a URL-keyed cache would serve the previous logo after a
// re-upload — a visibly wrong document is a worse failure than a few ms of CPU.
//
// Contract: NEVER throws. Every failure degrades to `null`, i.e. a logo-less
// header, because a broken image must never cost the user their document.
import 'server-only'
import { resolveAssetForRenderer } from '@/lib/storage/asset-inline'
import { dataUriMediaType, willPdfRenderLogo } from './pdf-image-support'

/**
 * Longest-edge cap for the transcoded logo, in pixels. The header draws it into
 * a 72x72pt (Classic) / 64x64pt (Modern) box with `objectFit: 'contain'`, so
 * 320px is ~4.4x the largest on-page size — comfortably past 300 DPI print
 * sharpness — while making the PNG branch's worst case arithmetically bounded
 * (320 x 320 x 4 = 400 kB of raw RGBA before deflate). Never upscales.
 */
const MAX_LOGO_EDGE_PX = 320

/**
 * Resolves `company.logo_url` into something `@react-pdf/renderer` will actually
 * draw, or `null`.
 *
 *   - falsy / unresolvable            -> null
 *   - already-drawable (png/jpeg data URI, or an absolute URL react-pdf can
 *     decode)                         -> returned unchanged
 *   - `data:image/webp` (or gif, or any other raster asset-inline allowlists)
 *                                     -> transcoded to a png/jpeg data URI
 *
 * Call this INSTEAD OF `resolveAssetForRenderer` on the PDF path only. The
 * `ImageResponse` favicon routes (app/icon.tsx, app/apple-icon.tsx) must keep
 * calling the raw resolver: that renderer DOES decode WebP, and paying a
 * transcode there would be pure waste.
 */
export async function resolvePdfLogo(url: string | null | undefined): Promise<string | null> {
  let resolved: string | null
  try {
    resolved = await resolveAssetForRenderer(url)
  } catch {
    // resolveAssetForRenderer documents "never throws"; a broken render is not
    // an acceptable price for that promise being wrong.
    return null
  }
  if (!resolved) return null

  // Already drawable (png/jpeg data URI, or an absolute URL whose extension is
  // not one react-pdf provably cannot decode) — hand it straight through, byte
  // identical. This is what keeps the `/storage/logos/{id}/logo.png` rows that
  // already render today on their exact current code path.
  if (willPdfRenderLogo(resolved)) return resolved

  // Not drawable. The only case we can repair without a network call is a data
  // URI we already hold the bytes for; an absolute URL to a `.webp` would need a
  // fetch, which belongs to react-pdf, not here.
  const mediaType = dataUriMediaType(resolved)
  if (mediaType === null) return null

  const comma = resolved.indexOf(',')
  const payload = resolved.slice(comma + 1)
  // asset-inline only ever emits base64, but a `data:` URI is not required to
  // be: decoding a percent-encoded payload as base64 would produce garbage
  // bytes, and sharp would then reject them. Refuse rather than guess.
  if (!/;base64$/i.test(resolved.slice('data:'.length, comma))) return null

  let source: Buffer
  try {
    source = Buffer.from(payload, 'base64')
  } catch {
    return null
  }
  if (source.byteLength === 0) return null

  return transcodeToPdfSafeDataUri(source)
}

/**
 * Decodes any raster `sharp` understands and re-encodes it as PNG (when the
 * source carries alpha — the overwhelmingly common case for a logo, and dropping
 * it would paint a black box behind the mark) or JPEG (when it does not, which
 * is materially smaller for a photographic or solid-background logo).
 *
 * `sharp` is imported lazily so the native binding is only loaded on a render
 * that genuinely needs a transcode, and so importing this module from a test or
 * a route that never hits the WebP path costs nothing.
 */
async function transcodeToPdfSafeDataUri(source: Buffer): Promise<string | null> {
  try {
    const { default: sharp } = await import('sharp')

    // `animated: false` (the default) takes frame 0 of an animated WebP/GIF —
    // a PDF has no animation to render anyway, and without it sharp would emit
    // a tall filmstrip of every frame.
    const pipeline = sharp(source).resize({
      width: MAX_LOGO_EDGE_PX,
      height: MAX_LOGO_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })

    const metadata = await sharp(source).metadata()
    const hasAlpha = metadata.hasAlpha === true

    if (hasAlpha) {
      const png = await pipeline.png({ compressionLevel: 9 }).toBuffer()
      return `data:image/png;base64,${png.toString('base64')}`
    }
    const jpeg = await pipeline.jpeg({ quality: 90 }).toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    // Corrupt bytes, an unsupported codec, a sharp binding that failed to load —
    // all the same outcome: no logo, and a document that still renders.
    return null
  }
}
