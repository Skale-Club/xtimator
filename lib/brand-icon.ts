import 'server-only'
import { readFile } from 'fs/promises'
import path from 'path'
import { getBranding } from '@/lib/platform-config'

/** Solid brand-dark background baked behind every generated icon tile. */
export const BRAND_ICON_BG = '#0a0a0f'

/**
 * Resolve the brand mark as a base64 data URI, in priority order:
 *   1. the admin-configured favicon, else logo, stored in `platform_branding`
 *   2. the static real-logo asset bundled at `public/icons/logo.png`
 *
 * There is intentionally NO hand-drawn glyph fallback — the brand mark is always
 * the real logo image (from the DB, or the bundled copy of it). The dynamic
 * `app/icon.tsx` and `app/apple-icon.tsx` routes composite this over
 * {@link BRAND_ICON_BG} so the tile background is always dark.
 *
 * Returns null only if both the DB lookup/fetch and the bundled asset fail, in
 * which case callers render a plain dark tile (never a substitute glyph).
 */
export async function loadBrandLogoDataUri(): Promise<string | null> {
  try {
    const b = await getBranding()
    const url = b.faviconUrl ?? b.logoUrl
    if (url) {
      const res = await fetch(url)
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        const mime = res.headers.get('content-type')?.split(';')[0] ?? 'image/png'
        return `data:${mime};base64,${buf.toString('base64')}`
      }
    }
  } catch {
    // branding lookup/fetch failed — fall through to the bundled static logo
  }
  try {
    // Static real-logo copy shipped with the app (Dockerfile copies public/).
    const buf = await readFile(path.join(process.cwd(), 'public/icons/logo.png'))
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
