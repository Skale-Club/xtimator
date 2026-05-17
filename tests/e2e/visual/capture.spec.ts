import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { freezeAnimations, setLang, viewports } from './_helpers'

/**
 * Phase 71 Plan 08 — Capture / Describe / Photos-input visual baselines.
 *
 * These screens live under the (capture) route group — full-screen layout
 * with NO app shell (RESEARCH G12). They require an authenticated session +
 * a real project ID seeded via SEED_PROJECT_ID env var. If either is missing
 * the spec auto-skips.
 *
 * The framer-motion gradient ring on /capture is rendered around the mic
 * button (Phase 18). freezeAnimations stops it so snapshots are stable.
 *
 * Spanish (`es`) is skipped for parity with sibling specs — static dictionary
 * covers EN/PT; ES uses async fallback which is non-deterministic for diffs.
 */
const statePath = 'tests/e2e/fixtures/authenticated-state.json'
const hasAuth =
  existsSync(statePath) && readFileSync(statePath, 'utf8').includes('cookies')
const seedProjectId = process.env.SEED_PROJECT_ID

const captureLangs = ['en', 'pt'] as const
const screens = ['capture', 'describe', 'photos-input'] as const

test.use({ storageState: hasAuth ? statePath : undefined })

test.describe('@visual capture', () => {
  test.skip(
    !hasAuth || !seedProjectId,
    'capture visual specs require auth fixture + SEED_PROJECT_ID'
  )
  for (const screen of screens) {
    for (const vp of viewports) {
      for (const lang of captureLangs) {
        test(`${screen} — ${vp.name} ${lang}`, async ({ page, context }) => {
          await setLang(context, lang)
          await page.setViewportSize({ width: vp.width, height: vp.height })
          const resp = await page.goto(
            `/projects/${seedProjectId}/${screen}`,
            { waitUntil: 'networkidle' }
          )

          const onTarget = page.url().includes(`/${screen}`)
          test.skip(
            !resp || resp.status() >= 400 || !onTarget,
            `${screen} requires a real seeded project (SEED_PROJECT_ID)`
          )

          await freezeAnimations(page)
          await expect(page).toHaveScreenshot(
            `capture-${screen}-${vp.name}-${lang}.png`,
            { fullPage: true, maxDiffPixelRatio: 0.02 }
          )
        })
      }
    }
  }
})
