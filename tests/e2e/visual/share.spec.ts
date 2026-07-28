import { test, expect } from '@playwright/test'
import { freezeAnimations, setLang, viewports, langs } from './_helpers'

/**
 * Phase 71-09 — Customer-facing share surface visual baselines.
 *
 * The share page is PUBLIC — no auth fixture required. A seed estimate
 * share token is consumed from SEED_ESTIMATE_TOKEN env var; when missing,
 * all tests skip so CI stays green in environments without seed data.
 *
 * Coverage matrix:
 *   3 viewports (desktop/tablet/mobile) x 3 langs (en/pt/es) = 9 baselines
 *   + 1 brand-override smoke (RESEARCH G6 tenant brand cascade)
 *   = 10 baselines total
 */

const seedToken = process.env.SEED_ESTIMATE_TOKEN

// Public share — no storage state
test.use({ storageState: undefined as unknown as string | undefined })

test.describe('@visual share', () => {
  test.skip(!seedToken, 'SEED_ESTIMATE_TOKEN env var missing')

  for (const vp of viewports) {
    for (const lang of langs) {
      test(`share — ${vp.name} ${lang}`, async ({ page, context }) => {
        await setLang(context, lang)
        await page.setViewportSize({ width: vp.width, height: vp.height })
        const resp = await page.goto(`/estimate/${seedToken}`, {
          waitUntil: 'networkidle',
        })
        test.skip(
          !resp || resp.status() >= 400,
          'seed token does not resolve to a valid estimate'
        )
        await freezeAnimations(page)
        await expect(page).toHaveScreenshot(`share-${vp.name}-${lang}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.02,
        })
      })
    }
  }

  // Phase 186 Plan 02 (POLISH-01) — intentional removal, not silent: the two
  // payment success/canceled banner visual baselines (each keyed off a
  // "stripe" query param) that used to sit below this comment were deleted.
  // Confirmed during planning that neither `app/estimate/[token]/page.tsx`
  // nor `app/estimate/[token]/actions.ts` ever reads that query param (grep
  // returned zero matches) — these banners were pure no-ops, superseded by
  // the Phase 94 issued-invoice pay-link UI that
  // `components/share/estimate-view.tsx` already renders unconditionally.
  // The tests were redundant with the 9-baseline viewport x lang matrix
  // above and asserted dead behavior. See the corrected coverage matrix in
  // this file's top docblock.

  test('share — tenant brand override cascade (G6 smoke)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const resp = await page.goto(`/estimate/${seedToken}`, {
      waitUntil: 'networkidle',
    })
    test.skip(!resp || resp.status() >= 400, 'seed token does not resolve')
    // Override --platform-primary to a vivid red on the forced-light scope
    // and confirm gradient-hero + gradient-brand re-tint via hsl(var(--primary)).
    await page.evaluate(() => {
      const root = document.querySelector(
        '[data-theme="light"]'
      ) as HTMLElement | null
      if (root) root.style.setProperty('--platform-primary', '0 80% 55%')
    })
    await freezeAnimations(page)
    await expect(page).toHaveScreenshot('share-brand-override.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    })
  })
})
