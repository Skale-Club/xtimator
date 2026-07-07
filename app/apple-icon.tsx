import { readFile } from 'fs/promises'
import path from 'path'
import { ImageResponse } from 'next/og'
import { getBranding } from '@/lib/platform-config'

/**
 * Dynamic apple-touch-icon (180×180).
 *
 * iOS home-screen icons get a solid background and an edge-to-edge squircle
 * crop — a raw branding logo (transparent, full-bleed) renders as a black
 * square with the glyph cut off at the corners. This route composites the
 * branding favicon/logo centered at ~62% over a solid brand-dark background,
 * which is the Apple-recommended safe zone, so the installed icon is never
 * cropped regardless of what the admin uploads.
 *
 * layout.tsx intentionally does NOT override `icons.apple` anymore — Next.js
 * auto-links this route as the apple-touch-icon.
 */

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'
// Branding can change at runtime (admin upload) — re-render hourly.
export const revalidate = 3600

const BG = '#0a0a0f'
// 112/180 ≈ 62% — keeps the glyph inside the squircle safe zone.
const GLYPH = 112

async function loadLogoDataUri(): Promise<string | null> {
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
    // branding lookup/fetch failed — fall through to the static glyph
  }
  try {
    // Static fallback glyph shipped with the app (Dockerfile copies public/).
    const buf = await readFile(path.join(process.cwd(), 'public/icons/icon-192.png'))
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export default async function AppleIcon() {
  const logo = await loadLogoDataUri()

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: BG,
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
        ) : (
          <div style={{ display: 'flex', color: '#fafafa', fontSize: 96, fontWeight: 700 }}>X</div>
        )}
      </div>
    ),
    size
  )
}
