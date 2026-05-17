import { test, expect } from '@playwright/test'
import { freezeAnimations, setLang, viewports } from './_helpers'

/**
 * Phase 71 Plan 06 — Dashboard visual baselines.
 *
 * /dashboard requires an authenticated session. Until Wave 0 ships the
 * authenticated-state fixture, the spec skips when the page redirects to
 * /login. Once the fixture lands, `--update-snapshots` will mint baselines.
 *
 * Spanish (`es`) is skipped here for parity with the app-shell spec — the
 * static dictionary covers EN/PT and the async API fallback is non-deterministic
 * for snapshot diffing.
 */
const dashLangs = ['en', 'pt'] as const

test.describe('@visual dashboard', () => {
  for (const vp of viewports) {
    for (const lang of dashLangs) {
      test(`/dashboard — ${vp.name} ${lang}`, async ({ page, context }) => {
        await setLang(context, lang)
        await page.setViewportSize({ width: vp.width, height: vp.height })
        const resp = await page.goto('/dashboard', { waitUntil: 'networkidle' })

        // Redirect to /login (or onboarding) → no auth fixture yet
        const onDashboard = page.url().includes('/dashboard')
        test.skip(
          !resp || resp.status() >= 400 || !onDashboard,
          '/dashboard requires auth fixture (not yet available)'
        )

        await freezeAnimations(page)
        await expect(page).toHaveScreenshot(
          `dashboard-${vp.name}-${lang}.png`,
          { fullPage: true, maxDiffPixelRatio: 0.02 }
        )
      })
    }
  }
})
