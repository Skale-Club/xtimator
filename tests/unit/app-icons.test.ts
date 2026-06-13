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
    // favicon.ico intentionally removed in 802890f — generateMetadata icons take priority
    // over a static .ico; the manifest fallback still references /favicon.ico for legacy clients
    expect(existsSync(resolve(appDir, 'icon.svg'))).toBe(true)
    expect(existsSync(resolve(appDir, 'icon.png'))).toBe(true)
    expect(existsSync(resolve(appDir, 'apple-icon.png'))).toBe(true)
    expect(existsSync(resolve(appDir, 'manifest.ts'))).toBe(true)
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
