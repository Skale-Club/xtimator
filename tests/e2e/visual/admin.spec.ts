import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { freezeAnimations, setLang } from './_helpers'

/**
 * Admin visual contract — Phase 71-10.
 *
 * Iterates 10 admin sub-pages (filesystem-verified; /admin/design-system from
 * 71-02 included). Desktop-only — admin is a dev/internal tool, mobile not a
 * priority. EN-only — admin UI is platform-language locked.
 *
 * Requires authenticated admin state fixture.
 */
const statePath = 'tests/e2e/fixtures/authenticated-state.json'
const hasAuth =
  existsSync(statePath) && readFileSync(statePath, 'utf8').includes('"cookies"')

test.use({ storageState: hasAuth ? statePath : undefined })

const ADMIN_PATHS = [
  '/admin',
  '/admin/admins',
  '/admin/billing',
  '/admin/branding',
  '/admin/blog',
  '/admin/blog/new',
  '/admin/integrations',
  '/admin/landing',
  '/admin/seo',
  '/admin/design-system',
] as const

test.describe('@visual admin', () => {
  test.skip(
    !hasAuth,
    'authenticated state fixture missing — seed login flow needed'
  )
  for (const path of ADMIN_PATHS) {
    const slug = path.replace(/\//g, '-').replace(/^-/, '')
    test(`admin ${slug} — desktop en`, async ({ page, context }) => {
      await setLang(context, 'en')
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(path, { waitUntil: 'networkidle' })
      await freezeAnimations(page)
      await expect(page).toHaveScreenshot(
        `admin-${slug}-desktop-en.png`,
        { fullPage: true, maxDiffPixelRatio: 0.02 }
      )
    })
  }
})
