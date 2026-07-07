import { ImageResponse } from 'next/og'
import { BRAND_ICON_BG, loadBrandLogoDataUri } from '@/lib/brand-icon'

/**
 * Dynamic browser-tab favicon.
 *
 * Renders the real brand mark — the admin favicon/logo from `platform_branding`,
 * else the bundled real-logo asset — centered over the solid brand-dark
 * background so the tab icon is ALWAYS dark and ALWAYS the DB logo (never a
 * hand-drawn glyph). Replaces the former static app/icon.png + app/icon.svg,
 * which shipped a stale/hand-drawn mark and let a light tile through in light mode.
 *
 * layout.tsx intentionally does NOT set `icons.icon` — Next.js auto-links this
 * route, so it is the single source of truth for the tab favicon.
 */

export const size = { width: 256, height: 256 }
export const contentType = 'image/png'
// Branding can change at runtime (admin upload) — re-render hourly.
export const revalidate = 3600

// 210/256 ≈ 82% — a touch of padding around the mark, favicon-tile style.
const GLYPH = 210

export default async function Icon() {
  const logo = await loadBrandLogoDataUri()

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: BRAND_ICON_BG,
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            width={GLYPH}
            height={GLYPH}
            style={{ objectFit: 'contain' }}
            alt=""
          />
        ) : null}
      </div>
    ),
    size
  )
}
