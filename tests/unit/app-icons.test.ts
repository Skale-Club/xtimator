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
    expect(existsSync(resolve(appDir, 'icon.svg'))).toBe(true)
    expect(existsSync(resolve(appDir, 'icon.png'))).toBe(true)
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
    // Phase 15-03: manifest icons are DB-backed branding URLs with static /icons/* fallbacks.
    // Manifest generation must never 502 just because platform branding lookup fails.
    expect(manifestSource).toMatch(/branding lookup failed; using static manifest fallback/)
    expect(manifestSource).toMatch(/src:\s*['"]\/icons\/icon-192\.png['"]/)
    expect(manifestSource).toMatch(/src:\s*['"]\/icons\/icon-512\.png['"]/)
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
})
