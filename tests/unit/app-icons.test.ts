import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const appDir = resolve(root, 'app')
const publicDir = resolve(root, 'public')

const layoutSource = readFileSync(resolve(appDir, 'layout.tsx'), 'utf8')
const proxySource = readFileSync(resolve(root, 'proxy.ts'), 'utf8')
const supabaseProxySource = readFileSync(resolve(root, 'lib/supabase/proxy.ts'), 'utf8')

function publicIconConflicts() {
  if (!existsSync(publicDir)) return []

  return readdirSync(publicDir).filter((entry) => {
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
    expect(existsSync(resolve(appDir, 'favicon.ico'))).toBe(true)
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
    expect(manifestSource).toMatch(/theme_color:\s*['"]#406EF1['"]/)
    expect(manifestSource).toMatch(/src:\s*['"]\/favicon\.ico['"]/)
    expect(manifestSource).toMatch(/src:\s*['"]\/icon['"]/)
    expect(manifestSource).toMatch(/src:\s*['"]\/apple-icon['"]/)
  })

  it('makes metadata routes public and middleware-safe', () => {
    expect(supabaseProxySource).toMatch(/pathname\s*===\s*['"]\/icon['"]/) 
    expect(supabaseProxySource).toMatch(/pathname\s*===\s*['"]\/apple-icon['"]/) 
    expect(supabaseProxySource).toMatch(/pathname\s*===\s*['"]\/manifest\.webmanifest['"]/) 
    expect(proxySource).toMatch(/manifest\.webmanifest\|icon\|apple-icon/)
  })

  it('avoids duplicate public icon ownership', () => {
    expect(publicIconConflicts()).toEqual([])
  })
})
