import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const rootPage = readFileSync(resolve(process.cwd(), 'app/page.tsx'), 'utf8')
const rootLayout = readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8')
const navAuth = readFileSync(
  resolve(process.cwd(), 'components/landing/top-nav-auth.tsx'),
  'utf8',
)
const landingPage = readFileSync(
  resolve(process.cwd(), 'components/landing/landing-page.tsx'),
  'utf8',
)

describe('anonymous homepage rendering', () => {
  it('does not read request-bound Supabase auth in the homepage server component', () => {
    expect(rootPage).not.toContain('@/lib/supabase/server')
    expect(rootPage).not.toContain('auth.getUser')
    expect(rootPage).not.toContain('auth.getClaims')
  })

  it('derives landing content from one resolved branding snapshot', () => {
    expect(rootPage.match(/\bgetBranding\(\)/g)).toHaveLength(1)
    expect(rootPage).not.toContain('getLandingContent')
    expect(rootPage).toContain('const landingContent = branding.landingContent')
  })

  it('defers database-backed landing media resolution until runtime', () => {
    expect(rootPage).toContain("export const dynamic = 'force-dynamic'")
    expect(rootPage).not.toContain('export const revalidate')
  })

  it('does not read cookies in the root layout', () => {
    expect(rootLayout).not.toContain('readThemeCookie')
    expect(rootLayout).not.toContain('next/headers')
  })

  it('enhances the navigation with browser-side auth state', () => {
    expect(navAuth).toContain('@/lib/supabase/client')
    expect(navAuth).toContain('auth.getUser')
    expect(navAuth).toContain('onAuthStateChange')
  })

  it('keeps query-string auth handling out of the static-render bailout path', () => {
    expect(landingPage).not.toContain('useSearchParams')
    expect(landingPage).toContain('new URLSearchParams(window.location.search)')
  })
})
