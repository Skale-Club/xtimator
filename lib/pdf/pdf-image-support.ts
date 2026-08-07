// lib/pdf/pdf-image-support.ts
//
// PDF-LOGO-01 — the ONE definition of "will `@react-pdf/renderer` actually
// draw this image?", shared by the height MEASUREMENT
// (lib/pdf/measure-header-height.ts) and the RENDER GATE
// (components/pdf/shared/pdf-header.tsx) so the two can never disagree again.
//
// --- The bug this module exists to close ---
//
// All four `logos` writers (lib/actions/settings.ts, company.ts, client.ts,
// admin-company.ts) run `convertImageToWebp` and upload `logo.webp` with
// `contentType: 'image/webp'`. `@react-pdf/image` decodes **only** jpg/jpeg/png:
//
//   node_modules/@react-pdf/image/lib/index.js:128
//     const isValidFormat = (format) => {
//       const lower = format.toLowerCase();
//       return lower === 'jpg' || lower === 'jpeg' || lower === 'png';
//     };
//
// and that gate is applied on BOTH resolution paths — the data-URI path
// (`resolveBase64Image`, :159) and the remote-URL path (`resolveImageFromUrl`,
// :193, which sniffs magic bytes via `getImageFormat` and only knows
// `JPEG.isValid`/`PNG.isValid`). So a WebP company logo has NEVER rendered in
// an estimate PDF, by either route.
//
// Meanwhile `measureHeaderHeightPt` charged 64pt (Modern) / 72pt (Classic) plus
// the header-right gap purely on `logo_url` being a non-empty string, so every
// PDF for a logo-bearing company reserved a blank block. Measurement and render
// were keyed on two DIFFERENT questions. This module makes them one question.
//
// PURE and BROWSER-SAFE, deliberately: `measureHeaderHeightPt` is reached from
// the client hook components/workspace/estimate/use-paginated-preview.ts (via
// computeEstimatePageConstraints), so nothing here may import `sharp`,
// `server-only`, or touch I/O. The actual WebP -> PNG transcode lives in
// lib/pdf/resolve-pdf-logo.ts, which IS server-only.
import { isStorageProxyPath } from '@/lib/storage/asset-url'

/**
 * Mirrors `@react-pdf/image`'s `isValidFormat` exactly (cited above). If that
 * ever grows a format, this is the one place to widen — and
 * lib/pdf/resolve-pdf-logo.ts's transcode target should be revisited with it.
 */
const PDF_RENDERABLE_DATA_URI_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg'])

/**
 * Extensions react-pdf can NEVER draw from a remote URL. `resolveImageFromUrl`
 * sniffs the fetched bytes rather than the extension, so this list is a
 * heuristic — but it is the only signal available without performing the fetch
 * ourselves, and it is exactly right for the legacy `*.supabase.co/.../logo.webp`
 * rows this predicate has to reason about. Anything NOT on this list is assumed
 * renderable (an extensionless CDN URL is far more likely to be a PNG/JPEG than
 * not, and guessing "false" there would REMOVE a logo that renders today).
 */
const NON_RENDERABLE_URL_EXTENSIONS = ['.webp', '.gif', '.svg', '.avif', '.bmp', '.tif', '.tiff', '.ico']

/** The media type of a `data:` URI, lowercased, or null if `value` is not one. */
export function dataUriMediaType(value: string): string | null {
  if (!value.startsWith('data:')) return null
  const comma = value.indexOf(',')
  if (comma === -1) return null
  const meta = value.slice('data:'.length, comma)
  return meta.split(';')[0].trim().toLowerCase()
}

/**
 * True iff the PDF pipeline will actually DRAW this logo — the single gate for
 * both header measurement and the `<Image>` element.
 *
 * The four cases, and why:
 *
 *   1. falsy                    -> false. No logo.
 *   2. `data:` URI              -> true only for png/jpeg. This is the case that
 *      was silently false-positive before PDF-LOGO-01: a `data:image/webp` URI
 *      is truthy but react-pdf throws `Base64 image invalid format: webp` and
 *      draws nothing.
 *   3. `/storage/{bucket}/{key}` -> **true**, even for a `.webp` key. This is
 *      deliberate and load-bearing: lib/pdf/resolve-pdf-logo.ts reads that object
 *      in-process and TRANSCODES it to PNG before the renderer ever sees it, so a
 *      logo WILL be drawn. It is also what keeps the web paginated preview in
 *      parity — that client hook measures the RAW path (it cannot call a
 *      server-only resolver), and the PDF measures the resolved data URI; both
 *      must answer the same. See the parity note at both
 *      `computeEstimatePageConstraints` call sites.
 *   4. absolute http(s) URL     -> true unless the path ends in an extension
 *      react-pdf provably cannot decode. We do not fetch it here (react-pdf does
 *      that itself, and a fetch in a pure browser-safe module is out of the
 *      question); the extension check exists so a legacy
 *      `*.supabase.co/.../logo.webp` row stops reserving space for a logo that
 *      will not appear.
 *
 * Anything else (a bare relative path that is not one of ours, `javascript:`,
 * a protocol-relative `//host/x`) -> false: react-pdf running in Node has no
 * base URL and cannot resolve it.
 */
export function willPdfRenderLogo(value: string | null | undefined): boolean {
  if (!value) return false

  const mediaType = dataUriMediaType(value)
  if (mediaType !== null) return PDF_RENDERABLE_DATA_URI_MEDIA_TYPES.has(mediaType)

  // Same-origin proxy path: the server-side resolver guarantees a drawable
  // image (or null) for these.
  if (isStorageProxyPath(value)) return true

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

  const pathname = parsed.pathname.toLowerCase()
  return !NON_RENDERABLE_URL_EXTENSIONS.some((ext) => pathname.endsWith(ext))
}
