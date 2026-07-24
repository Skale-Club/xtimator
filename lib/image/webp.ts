import 'server-only'
import sharp from 'sharp'

/**
 * Convert an uploaded image File to WebP server-side. Used by every image
 * upload path in the app so stored images are consistently WebP regardless
 * of what the user uploaded (PNG/JPG/WebP in, WebP out).
 *
 * Deliberately NOT used for favicons — an .ico/.svg converted to WebP breaks
 * `<link rel="icon">` semantics, so that upload path stays raw.
 */
export async function convertImageToWebp(file: File, quality = 85): Promise<Buffer> {
  const input = Buffer.from(await file.arrayBuffer())
  return sharp(input).webp({ quality }).toBuffer()
}
