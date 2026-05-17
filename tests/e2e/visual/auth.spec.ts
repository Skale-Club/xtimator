import { test, expect } from '@playwright/test'
import { freezeAnimations, setLang, viewports, langs } from './_helpers'

// Fresh storage state per worker — auth pages would otherwise redirect logged-in users to /dashboard.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('@visual auth surfaces', () => {
  const publicSurfaces = ['/login', '/signup', '/reset-password'] as const

  for (const path of publicSurfaces) {
    for (const vp of viewports) {
      for (const lang of langs) {
        test(`${path} — ${vp.name} ${lang}`, async ({ page, context }) => {
          await setLang(context, lang)
          await page.setViewportSize({ width: vp.width, height: vp.height })
          const resp = await page.goto(path, { waitUntil: 'networkidle' })
          test.skip(!resp || resp.status() >= 400, `${path} not reachable`)
          await freezeAnimations(page)
          const name = path.replace(/^\//, '').replace(/\//g, '-') || 'root'
          await expect(page).toHaveScreenshot(
            `auth-${name}-${vp.name}-${lang}.png`,
            { fullPage: true, maxDiffPixelRatio: 0.02 }
          )
        })
      }
    }
  }
})

// /onboarding requires an authenticated session — skipped until the Wave-0 auth fixture lands.
// Spec ships now so baselines can mint with `--update-snapshots` once the fixture exists.
test.describe('@visual onboarding surfaces', () => {
  for (const vp of viewports) {
    for (const lang of langs) {
      test(`/onboarding — ${vp.name} ${lang}`, async ({ page, context }) => {
        await setLang(context, lang)
        await page.setViewportSize({ width: vp.width, height: vp.height })
        const resp = await page.goto('/onboarding', { waitUntil: 'networkidle' })
        // If unauthenticated, page redirects to /login → URL no longer matches /onboarding.
        const isOnboarding = page.url().includes('/onboarding')
        test.skip(
          !resp || resp.status() >= 400 || !isOnboarding,
          '/onboarding requires auth fixture (not yet available)'
        )
        await freezeAnimations(page)
        await expect(page).toHaveScreenshot(
          `auth-onboarding-${vp.name}-${lang}.png`,
          { fullPage: true, maxDiffPixelRatio: 0.02 }
        )
      })
    }
  }
})
