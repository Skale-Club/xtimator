import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { freezeAnimations, setLang, viewports } from './_helpers'

/**
 * Settings visual contract — Phase 71-10.
 *
 * Iterates the 8 actual settings sub-pages (RESEARCH G11 corrected inventory —
 * NOT the SEED's 9 hypothetical pages). Desktop + mobile viewport, EN + PT only
 * (PT is the longest-string proxy; skip ES to keep baseline matrix lean).
 *
 * Requires authenticated state fixture (`tests/e2e/fixtures/authenticated-state.json`).
 * Skips cleanly until the fixture lands (same pattern as app-shell.spec.ts).
 */
const statePath = 'tests/e2e/fixtures/authenticated-state.json'
const hasAuth =
  existsSync(statePath) && readFileSync(statePath, 'utf8').includes('"cookies"')

test.use({ storageState: hasAuth ? statePath : undefined })

const SETTINGS_PATHS = [
  '/settings',
  '/settings/appearance',
  '/settings/billing',
  '/settings/custom-domain',
  '/settings/estimate-templates',
  '/settings/integrations',
  '/settings/integrations/stripe',
  '/price-book',
] as const

const VPS = viewports.filter(vp => vp.name === 'desktop' || vp.name === 'mobile')
const LANGS = ['en', 'pt'] as const

test.describe('@visual settings', () => {
  test.skip(
    !hasAuth,
    'authenticated state fixture missing — seed login flow needed'
  )
  for (const path of SETTINGS_PATHS) {
    const slug = path.replace(/\//g, '-').replace(/^-/, '') || 'root'
    for (const vp of VPS) {
      for (const lang of LANGS) {
        test(`settings ${slug} — ${vp.name} ${lang}`, async ({ page, context }) => {
          await setLang(context, lang)
          await page.setViewportSize({ width: vp.width, height: vp.height })
          await page.goto(path, { waitUntil: 'networkidle' })
          await freezeAnimations(page)
          await expect(page).toHaveScreenshot(
            `settings-${slug}-${vp.name}-${lang}.png`,
            { fullPage: true, maxDiffPixelRatio: 0.02 }
          )
        })
      }
    }
  }
})
