import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { freezeAnimations, setLang, viewports } from './_helpers'

// App-shell visual contract — Phase 71-05.
// Surface: /dashboard (rendered inside the (app) layout — sidebar + topbar + bottom-nav).
// Auth fixture is currently an empty `{}` stub. Once a seed login flow lands and
// `tests/e2e/fixtures/authenticated-state.json` contains real cookies, these specs
// will automatically un-skip and mint baselines on the next `--update-snapshots` run.
const statePath = 'tests/e2e/fixtures/authenticated-state.json'
const hasAuth =
  existsSync(statePath) && readFileSync(statePath, 'utf8').includes('"cookies"')

test.use({ storageState: hasAuth ? statePath : undefined })

test.describe('@visual app-shell', () => {
  test.skip(
    !hasAuth,
    'authenticated state fixture missing — seed login flow needed'
  )
  for (const vp of viewports) {
    // Shell layout is locale-invariant beyond the toggle widgets; snap EN + PT only
    // to keep the baseline matrix lean (6 instead of 9 — saves CI time + bytes).
    for (const lang of (['en', 'pt'] as const)) {
      test(`shell — ${vp.name} ${lang}`, async ({ page, context }) => {
        await setLang(context, lang)
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await page.goto('/dashboard', { waitUntil: 'networkidle' })
        await freezeAnimations(page)
        await expect(page).toHaveScreenshot(`shell-${vp.name}-${lang}.png`, {
          fullPage: false,
          maxDiffPixelRatio: 0.02,
        })
      })
    }
  }
})
