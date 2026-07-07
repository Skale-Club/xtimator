import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const appDir = resolve(root, 'app')
const publicDir = resolve(root, 'public')

const layoutSource = readFileSync(resolve(appDir, 'layout.tsx'), 'utf8')
// The root proxy.ts (Next middleware) was removed; the metadata-route exemption now lives
// solely in lib/supabase/proxy.ts (asserted below).
const supabaseProxySource = readFileSync(resolve(root, 'lib/supabase/proxy.ts'), 'utf8')

function publicIconConflicts() {
  if (!existsSync(publicDir)) return []

  return readdirSync(publicDir).filter((entry) => {
    // Only flag files, not directories (public/icons/ is the correct icon location)
    const fullPath = resolve(publicDir, entry)
    if (statSync(fullPath).isDirectory()) return false
    const lower = entry.toLowerCase()
    return (
      lower.startsWith('favicon') ||
      lower.startsWith('icon') ||
      lower.startsWith('apple-icon') ||
      lower.startsWith('manifest')
    )
  })
}

describe('App Router icon contract (Phase 13)', () => {
  it('ships all canonical icon assets under app/', () => {
    // The favicon is a DYNAMIC route (app/icon.tsx): it composites the real
    // brand mark (DB favicon/logo) over a solid dark background, so the tab icon
    // is always the DB logo and always dark. The former static app/icon.png +
    // app/icon.svg shipped a stale/hand-drawn mark and MUST NOT coexist with it
    // (a static file-convention icon would emit a competing <link rel="icon">
    // that the browser can pick over the dynamic route).
    expect(existsSync(resolve(appDir, 'icon.tsx'))).toBe(true)
    expect(existsSync(resolve(appDir, 'icon.svg'))).toBe(false)
    expect(existsSync(resolve(appDir, 'icon.png'))).toBe(false)
    // apple-icon is a DYNAMIC route (app/apple-icon.tsx): it composites the
    // branding logo centered over a solid background so iOS never squircle-crops
    // the glyph. A static apple-icon.png must NOT coexist with it.
    expect(existsSync(resolve(appDir, 'apple-icon.tsx'))).toBe(true)
    expect(existsSync(resolve(appDir, 'apple-icon.png'))).toBe(false)
    expect(existsSync(resolve(appDir, 'manifest.ts'))).toBe(true)
    // Regression guard: app/favicon.ico must NOT exist. As a Next.js file convention
    // it always emits a high-priority <link rel="icon" type="image/x-icon"> that wins
    // over the DB-backed admin favicon from generateMetadata (the browser tab then shows
    // the static default instead of the org's favicon). It was removed in 802890f for
    // exactly this reason, accidentally re-added in 8bf16a3, and removed again here.
    expect(existsSync(resolve(appDir, 'favicon.ico'))).toBe(false)
  })

  it('keeps hardcoded icon link tags out of app/layout.tsx', () => {
    // Static <link rel="icon"> / <link rel="apple-touch-icon"> must never appear
    // in layout.tsx — App Router serves icons from app/favicon.ico, app/icon.*, etc.
    // Dynamic `icons` in generateMetadata is allowed (Phase 15-03: DB-backed favicon).
    expect(layoutSource).not.toMatch(/<link\s+[^>]*rel=["'](?:shortcut\s+icon|icon|apple-touch-icon)["']/i)
  })

  it('defines the expected manifest contract', () => {
    const manifestSource = readFileSync(resolve(appDir, 'manifest.ts'), 'utf8')

    expect(manifestSource).toMatch(/start_url:\s*['"]\//)
    expect(manifestSource).toMatch(/display:\s*['"]standalone['"]/)
    expect(manifestSource).toMatch(/background_color:\s*['"]#0a0a0f['"]/)
    // theme_color now comes from SYSTEM_COLORS.primary (avoids duplication of the hex literal)
    expect(manifestSource).toMatch(/theme_color:\s*SYSTEM_COLORS\.primary/)
    // Manifest generation must never 502 just because platform branding lookup fails.
    expect(manifestSource).toMatch(/branding lookup failed; using static manifest fallback/)
    // The "any" tile is the dynamic /icon route (real DB logo composited on a
    // dark background); the maskable tiles are pre-composited dark PNGs.
    expect(manifestSource).toMatch(/src:\s*['"]\/icon['"]/)
    expect(manifestSource).toMatch(/src:\s*['"]\/icons\/icon-maskable-192\.png['"]/)
    expect(manifestSource).toMatch(/src:\s*['"]\/icons\/icon-maskable-512\.png['"]/)
    expect(manifestSource).toMatch(/purpose:\s*['"]maskable['"]/)
  })

  it('makes metadata routes public and middleware-safe', () => {
    expect(supabaseProxySource).toMatch(/pathname\s*===\s*['"]\/icon['"]/) 
    expect(supabaseProxySource).toMatch(/pathname\s*===\s*['"]\/apple-icon['"]/) 
    expect(supabaseProxySource).toMatch(/pathname\s*===\s*['"]\/manifest\.webmanifest['"]/) 
  })

  it('avoids duplicate public icon ownership', () => {
    expect(publicIconConflicts()).toEqual([])
  })

  it('renders the real brand mark on a dark background — never a hand-drawn glyph', () => {
    const iconSource = readFileSync(resolve(appDir, 'icon.tsx'), 'utf8')
    const appleSource = readFileSync(resolve(appDir, 'apple-icon.tsx'), 'utf8')
    const appIconSource = readFileSync(resolve(root, 'components/ui/app-icon.tsx'), 'utf8')

    // Both icon routes composite the DB logo over the shared dark background.
    for (const src of [iconSource, appleSource]) {
      expect(src).toMatch(/loadBrandLogoDataUri/)
      expect(src).toMatch(/BRAND_ICON_BG/)
    }

    // No hand-drawn glyph anywhere: the mark is always the real logo image, so
    // these files must not draw an SVG path/rect or a substitute "X" glyph.
    for (const src of [iconSource, appleSource, appIconSource]) {
      expect(src).not.toMatch(/<path\b/)
      expect(src).not.toMatch(/<rect\b/)
      expect(src).not.toMatch(/>\s*X\s*</)
    }

    // The shared loader falls back to the bundled real-logo asset, not a glyph.
    const loaderSource = readFileSync(resolve(root, 'lib/brand-icon.ts'), 'utf8')
    expect(loaderSource).toMatch(/public\/icons\/logo\.png/)
    expect(loaderSource).not.toMatch(/<path\b/)
  })
})
