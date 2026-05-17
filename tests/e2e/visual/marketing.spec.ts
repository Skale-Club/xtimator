import { test, expect } from '@playwright/test'
import { freezeAnimations, setLang, viewports, langs } from './_helpers'

// Marketing visual contract — Phase 71-03.
// Surfaces: / (landing), /blog (index), /blog/[slug] (post detail).
// Matrix: 3 viewports x 3 langs = 9 baselines per surface.
// Total: 27 baselines (landing + blog index + blog post if a published post exists).
// Blog post detail uses a probe via /blog index — if no post link is discoverable,
// that locale/viewport snapshot is gracefully skipped (DB may not be seeded in CI).
test.describe('@visual marketing', () => {
  for (const vp of viewports) {
    for (const lang of langs) {
      test(`landing — ${vp.name} ${lang}`, async ({ page, context }) => {
        await setLang(context, lang)
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await page.goto('/', { waitUntil: 'networkidle' })
        await freezeAnimations(page)
        await expect(page).toHaveScreenshot(`landing-${vp.name}-${lang}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.02,
        })
      })

      test(`blog index — ${vp.name} ${lang}`, async ({ page, context }) => {
        await setLang(context, lang)
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await page.goto('/blog', { waitUntil: 'networkidle' })
        await freezeAnimations(page)
        await expect(page).toHaveScreenshot(`blog-${vp.name}-${lang}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.02,
        })
      })

      test(`blog post — ${vp.name} ${lang}`, async ({ page, context }) => {
        await setLang(context, lang)
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await page.goto('/blog', { waitUntil: 'networkidle' })
        const firstPost = page.locator('article a[href^="/blog/"]').first()
        const count = await firstPost.count()
        test.skip(count === 0, 'No published blog posts to snapshot')
        const href = await firstPost.getAttribute('href')
        test.skip(!href, 'Blog post link missing href')
        await page.goto(href!, { waitUntil: 'networkidle' })
        await freezeAnimations(page)
        await expect(page).toHaveScreenshot(`blog-post-${vp.name}-${lang}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.02,
        })
      })
    }
  }
})
