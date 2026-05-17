import { test, expect } from '@playwright/test'
import { freezeAnimations, viewports, langs, setLang } from './_helpers'

// Renders /admin/design-system reference page once Plan 71-02 ships it.
// Until then test.skip if route returns 404.
test.describe('@visual design-system reference', () => {
  for (const vp of viewports) {
    for (const lang of langs) {
      test(`design-system page — ${vp.name} ${lang}`, async ({ page, context }) => {
        await setLang(context, lang)
        await page.setViewportSize({ width: vp.width, height: vp.height })
        const resp = await page.goto('/admin/design-system', { waitUntil: 'networkidle' })
        test.skip(!resp || resp.status() === 404, 'design-system page not yet live')
        await freezeAnimations(page)
        await expect(page).toHaveScreenshot(`design-system-${vp.name}-${lang}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.02,
        })
      })
    }
  }
})
