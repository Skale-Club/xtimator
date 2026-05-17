import { test, expect } from '@playwright/test'
import { freezeAnimations, setLang, viewports } from './_helpers'

/**
 * Phase 71 Plan 06 — Collections visual baselines.
 *
 * Covers /clients, /projects, /projects/new — all gated by auth. Skips
 * cleanly until the Wave 0 authenticated-state fixture lands.
 */
const colLangs = ['en', 'pt'] as const
const surfaces = ['/clients', '/projects', '/projects/new'] as const

test.describe('@visual collections', () => {
  for (const path of surfaces) {
    for (const vp of viewports) {
      for (const lang of colLangs) {
        test(`${path} — ${vp.name} ${lang}`, async ({ page, context }) => {
          await setLang(context, lang)
          await page.setViewportSize({ width: vp.width, height: vp.height })
          const resp = await page.goto(path, { waitUntil: 'networkidle' })

          const stillOnPath = page.url().includes(path)
          test.skip(
            !resp || resp.status() >= 400 || !stillOnPath,
            `${path} requires auth fixture (not yet available)`
          )

          await freezeAnimations(page)
          const name = path.replace(/^\//, '').replace(/\//g, '-')
          await expect(page).toHaveScreenshot(
            `collections-${name}-${vp.name}-${lang}.png`,
            { fullPage: true, maxDiffPixelRatio: 0.02 }
          )
        })
      }
    }
  }
})
