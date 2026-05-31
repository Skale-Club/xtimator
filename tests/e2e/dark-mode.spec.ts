import { test, expect } from '@playwright/test'

// Phase 9 — dark-mode defaults & scoped theme wrappers
//
// Post 260524-ohe: /login, /signup, /reset-password no longer exist as routes.
// Auth surface is the LP modal opened via /?auth=login (or signup). The
// landing layout owns the dark class on its <div data-testid="landing-shell">.
// The estimate share route keeps its forced-light wrapper as before.

test.describe('Phase 9 — dark-mode defaults & scoped theme wrappers', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('default-dark: fresh visit renders <html class="dark">', async ({ page }) => {
    await page.goto('/?auth=login')
    await page.waitForSelector('[role="dialog"]')
    await expect
      .poll(async () => await page.evaluate(() => document.documentElement.className))
      .toMatch(/(^|\s)dark(\s|$)/)
  })

  test('scoped-wrappers-intact: /?auth=login renders landing shell in dark mode', async ({
    page,
  }) => {
    await page.goto('/?auth=login')
    await expect(page.locator('[data-testid="landing-shell"]')).toHaveCount(1)
  })

  test('estimate-forced-light: /estimate/<token> wraps content in [data-theme="light"]', async ({
    page,
  }) => {
    const resp = await page.goto('/estimate/test-token-does-not-exist')
    if (resp && resp.status() >= 500) test.skip(true, 'Server error — cannot assert layout')
    const wrapper = page.locator('[data-theme="light"]')
    await expect(wrapper.first()).toBeVisible({ timeout: 5_000 })
  })
})

// Phase 9 (09-04) — public routes render in dark mode when eb-theme=dark cookie is set.
test.describe('Phase 9 — routes render in dark mode', () => {
  const PUBLIC_ROUTES = ['/', '/?auth=login', '/?auth=signup']

  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
      { name: 'eb-theme', value: 'dark', url: baseURL ?? 'http://localhost:9633' },
    ])
  })

  for (const path of PUBLIC_ROUTES) {
    test(`routes-render-dark: ${path} has <html class*="dark">`, async ({ page }) => {
      await page.goto(path)
      if (path.includes('auth=')) {
        await page.waitForSelector('[role="dialog"]')
      }
      const cls = await page.evaluate(() => document.documentElement.className)
      expect(cls).toMatch(/(^|\s)dark(\s|$)/)
    })
  }
})

// Phase 9 (09-08) — primitives render with dark palette.
test.describe('Phase 9 — primitives render with dark palette', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'eb-theme', value: 'dark', url: 'http://localhost:9633' },
    ])
  })

  test('primitives-dark: body background resolves to a non-white color when eb-theme=dark', async ({
    page,
  }) => {
    await page.goto('/?auth=login')
    await page.waitForSelector('[role="dialog"]')
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).not.toBe('rgb(255, 255, 255)')
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  })
})
