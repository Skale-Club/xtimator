import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { freezeAnimations, setLang, viewports } from './_helpers'

/**
 * Phase 71 Plan 07 — Project workspace visual baselines.
 *
 * The 5-tab workspace at /projects/[id] requires:
 *   - An authenticated session (auth fixture, same as 71-05/71-06)
 *   - A seed project ID injected via SEED_PROJECT_ID env var
 *
 * Until both land, the spec skips cleanly. Once available, run:
 *   VISUAL=1 SEED_PROJECT_ID=<uuid> bunx playwright test \
 *     tests/e2e/visual/workspace.spec.ts --grep @visual --update-snapshots
 */
const statePath = 'tests/e2e/fixtures/authenticated-state.json'
const hasAuth =
  existsSync(statePath) && readFileSync(statePath, 'utf8').includes('cookies')
const seedProjectId = process.env.SEED_PROJECT_ID

test.use({ storageState: hasAuth ? statePath : undefined })

test.describe('@visual workspace', () => {
  const tabs = ['overview', 'audio', 'photos', 'estimate', 'send'] as const
  const langs = ['en', 'pt'] as const

  for (const tab of tabs) {
    for (const vp of viewports) {
      for (const lang of langs) {
        test(`workspace ${tab} — ${vp.name} ${lang}`, async ({
          page,
          context,
        }) => {
          test.skip(
            !hasAuth || !seedProjectId,
            'workspace visual baselines require auth fixture + SEED_PROJECT_ID'
          )

          await setLang(context, lang)
          await page.setViewportSize({ width: vp.width, height: vp.height })

          const url = `/projects/${seedProjectId}${tab === 'overview' ? '' : `?tab=${tab}`}`
          const resp = await page.goto(url, { waitUntil: 'networkidle' })

          // If we got bounced to /login the auth fixture has expired
          const onProject = page.url().includes(`/projects/${seedProjectId}`)
          test.skip(
            !resp || resp.status() >= 400 || !onProject,
            'workspace requires valid auth session (fixture stale?)'
          )

          await freezeAnimations(page)
          await expect(page).toHaveScreenshot(
            `workspace-${tab}-${vp.name}-${lang}.png`,
            { fullPage: true, maxDiffPixelRatio: 0.02 }
          )
        })
      }
    }
  }
})
