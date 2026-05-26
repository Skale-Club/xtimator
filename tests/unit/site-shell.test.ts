import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

describe('SiteShell / SiteHeader / SiteFooter — reusable templates', () => {
  it('SiteShell file exists and re-exports SiteHeader + SiteFooter', () => {
    const src = readFileSync(resolve(ROOT, 'components/site/site-shell.tsx'), 'utf8')
    expect(src).toMatch(/from\s+['"]\.\/site-header['"]/)
    expect(src).toMatch(/from\s+['"]\.\/site-footer['"]/)
    expect(src).toMatch(/dark\s+isolate/)
  })

  it('SiteHeader is a server component (no use client) and uses Link-based auth navigation', () => {
    const src = readFileSync(resolve(ROOT, 'components/site/site-header.tsx'), 'utf8')
    expect(src).not.toMatch(/^['"]use client['"]/m)
    // The "Start" CTA must navigate to /?auth=signup so the landing page's
    // searchParams.auth handler picks it up — not call a callback.
    expect(src).toMatch(/href=["']\/\?auth=signup["']/)
  })

  it('SiteFooter is a server component and uses Link-based auth navigation', () => {
    const src = readFileSync(resolve(ROOT, 'components/site/site-footer.tsx'), 'utf8')
    expect(src).not.toMatch(/^['"]use client['"]/m)
    expect(src).toMatch(/href=["']\/\?auth=signup["']/)
    expect(src).toMatch(/href=["']\/\?auth=login["']/)
    // Legal links must point at the new public routes
    expect(src).toMatch(/href=["']\/privacy-policy["']/)
    expect(src).toMatch(/href=["']\/terms-of-service["']/)
  })
})

describe('Privacy policy + Terms of service pages use SiteShell', () => {
  for (const [routePath, slug] of [
    ['app/privacy-policy/page.tsx', 'privacy_policy'],
    ['app/terms-of-service/page.tsx', 'terms_of_service'],
  ]) {
    const src = readFileSync(resolve(ROOT, routePath), 'utf8')

    it(`${routePath} imports SiteShell from components/site/site-shell`, () => {
      expect(src).toMatch(/import\s+\{\s*SiteShell\s*\}\s+from\s+['"]@\/components\/site\/site-shell['"]/)
    })

    it(`${routePath} fetches branding via getBranding`, () => {
      expect(src).toMatch(/getBranding/)
    })

    it(`${routePath} wraps the article in <SiteShell branding={...}>`, () => {
      expect(src).toMatch(/<SiteShell\s+branding=\{/)
    })

    it(`${routePath} still resolves the ${slug} legal page row`, () => {
      expect(src).toMatch(new RegExp(`getLegalPage\\(['"]${slug}['"]\\)`))
    })

    it(`${routePath} no longer renders the ad-hoc gradient-hero shell`, () => {
      // The pre-refactor shell used a custom dark wrapper; SiteShell now owns it.
      expect(src).not.toMatch(/<div className="relative isolate min-h-screen">/)
    })
  }
})
