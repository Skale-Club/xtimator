// lib/pdf/resolve-pdf-photos.ts
//
// PDF-PHOTO-01 — makes attached job-site photos actually appear in a generated
// estimate PDF.
//
// --- The bug ---
//
// `lib/actions/photo.ts` stores every photo as `{companyId}/{projectId}/{id}.webp`
// with `contentType: 'image/webp'`. `lib/pdf/render-estimate-pdf.ts` used to hand
// react-pdf a short-lived SIGNED REMOTE URL to that object, and
// `@react-pdf/image`'s `resolveImageFromUrl` sniffs the fetched bytes with
// `getImageFormat`, which knows only `JPEG.isValid` / `PNG.isValid`. A WebP body
// throws `Not valid image extension`, @react-pdf/layout's `fetchImage` swallows
// it, and the grid renders blank — while `blocksFromModel` had already charged
// the page budget for it. Verified on real PDF bytes: zero `/Subtype /Image`
// entries for a WebP served over http, one for the identical bytes as JPEG.
//
// Same format problem as PDF-LOGO-01, different mechanism (remote fetch inside
// react-pdf vs. an inline data URI), hence its own resolver — but the SAME
// transcode (lib/pdf/transcode-pdf-image.ts), deliberately not a second copy.
//
// --- Why the bytes are read here instead of leaving react-pdf to fetch ---
//
// react-pdf cannot be taught a format it has no decoder for, and photos are NOT
// publicly readable (unlike logos there is no `/storage/` proxy path available
// to them). Reading the object through the SAME provider + SAME client the
// signed URL was minted from keeps the authorization story identical to the code
// this replaces: Supabase mode still applies the caller's `storage.objects` RLS;
// R2 mode still relies on the caller's own app-level authorization.
//
// --- Why this is affordable for up to 50 photos ---
//
// The grid draws each photo into a SQUARE {@link PHOTO_TILE_WIDTH_PT}pt cell
// with `objectFit: 'cover'`, so a full-resolution image is mostly cropped away
// and then downsampled by the viewer. Every photo is therefore pre-cropped and
// downscaled to exactly that cell at {@link PHOTO_TARGET_DPI} before it is
// embedded. Measured on real PDF bytes with 6 photo-like (incompressible noise)
// sources: 372 kB total vs 8.9 MB if the full-resolution images were inlined —
// 24x smaller, and that is the WORST case for JPEG. Reads/transcodes run at
// {@link RESOLVE_CONCURRENCY} at a time so 50 photos never hold 50 decoded
// bitmaps in memory at once.
//
// Contract: NEVER throws, and never fails the document. A photo that cannot be
// read or transcoded is DROPPED from the returned array — a partial photo grid
// beats a failed send. Dropping (rather than emitting a broken entry) is also
// what keeps measurement honest: the returned array is the one both
// `blocksFromModel` and the templates see, so page budget is charged for exactly
// the photos that will be drawn.
import 'server-only'
import type { StorageProvider } from '@/lib/storage'
import { PHOTO_TILE_WIDTH_PT } from '@/lib/estimate/document/tokens'
import { transcodeToPdfSafeDataUri } from './transcode-pdf-image'

/**
 * Target print resolution for a photo tile. 200 DPI is the low end of "looks
 * like a photograph, not like a screenshot" in print, and well past what any
 * on-screen PDF viewer resolves. With a 150pt tile that is a 417x417 image —
 * ~60 kB of JPEG for worst-case (noise) content, ~15-25 kB for a real photo.
 */
const PHOTO_TARGET_DPI = 200

/** PDF points are 1/72 inch by definition. */
const POINTS_PER_INCH = 72

/**
 * The exact pixel size of the square the grid draws, derived from the grid's own
 * shared tile token — never a hand-guessed constant. Changing the tile size in
 * lib/estimate/document/tokens.ts automatically re-targets the transcode.
 */
export const PHOTO_CELL_EDGE_PX = Math.round((PHOTO_TILE_WIDTH_PT / POINTS_PER_INCH) * PHOTO_TARGET_DPI)

/** Visually indistinguishable from q90 at this size, ~30% smaller. */
const PHOTO_JPEG_QUALITY = 82

/**
 * Refuse to decode a stored object larger than this. The client compresses
 * before upload and the server re-encodes to WebP, so a real photo is far under
 * it; the cap exists so one pathological object degrades to "that photo is
 * missing" instead of pinning a render's memory.
 */
const MAX_PHOTO_SOURCE_BYTES = 10 * 1024 * 1024

/** How many photos are read+decoded at once. */
const RESOLVE_CONCURRENCY = 4

/** The `photos` bucket every attached photo lives in (lib/actions/photo.ts). */
const PHOTO_BUCKET = 'photos'

export interface StoredPhoto {
  storage_path: string
  caption: string | null
}

export interface PdfReadyPhoto {
  /** A png/jpeg `data:` URI — guaranteed drawable by `willPdfRenderPhoto`. */
  url: string
  caption: string | null
}

/**
 * Reads each stored photo and returns it as a PDF-drawable JPEG data URI, in the
 * original order, with unresolvable photos omitted.
 */
export async function resolvePdfPhotos(
  photos: readonly StoredPhoto[],
  storage: StorageProvider
): Promise<PdfReadyPhoto[]> {
  if (photos.length === 0) return []

  const resolved = await mapWithConcurrency(photos, RESOLVE_CONCURRENCY, async (photo) => {
    const url = await resolveOnePhoto(photo, storage)
    return url === null ? null : { url, caption: photo.caption }
  })

  return resolved.filter((photo): photo is PdfReadyPhoto => photo !== null)
}

async function resolveOnePhoto(
  photo: StoredPhoto,
  storage: StorageProvider
): Promise<string | null> {
  if (!photo.storage_path) return null

  let blob: Blob
  try {
    blob = await storage.download(PHOTO_BUCKET, photo.storage_path)
  } catch {
    // Missing object, expired credentials, a provider outage — one photo is not
    // worth the document.
    return null
  }
  if (!blob) return null

  // A Blob knows its size up front, so the cap costs nothing.
  if (typeof blob.size === 'number' && blob.size > MAX_PHOTO_SOURCE_BYTES) return null

  let source: Buffer
  try {
    source = Buffer.from(await blob.arrayBuffer())
  } catch {
    return null
  }
  if (source.byteLength === 0 || source.byteLength > MAX_PHOTO_SOURCE_BYTES) return null

  return transcodeToPdfSafeDataUri(source, {
    kind: 'photo-cell',
    cellEdgePx: PHOTO_CELL_EDGE_PX,
    quality: PHOTO_JPEG_QUALITY,
  })
}

/**
 * Order-preserving `Promise.all` with a ceiling on how many run at once. Written
 * here rather than pulled in as a dependency because it is 12 lines and this is
 * its only caller.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await fn(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
