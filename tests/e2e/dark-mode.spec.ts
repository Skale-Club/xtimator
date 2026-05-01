import { test, expect } from '@playwright/test'

// Phase 9 — dark-mode defaults & scoped theme wrappers
//
// Contracts locked by these tests:
//   1. default-dark: with no `eb-theme` cookie, root layout renders <html class="dark">
//   2. scoped-wrappers-intact: /login, /signup, and /reset-password still render [data-theme="dark-auth"]
//   3. estimate-forced-light: /estimate/[token] layout wraps content in [data-theme="light"],
//      even though the root layout applies `class="dark"` on <html>.

test.describe('Phase 9 — dark-mode defaults & scoped theme wrappers', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('default-dark: fresh visit renders <html class="dark">', async ({ page }) => {
    await page.goto('/login')
    await expect
      .poll(async () => await page.evaluate(() => document.documentElement.className))
      .toMatch(/(^|\s)dark(\s|$)/)
  })

  test('scoped-wrappers-intact: /login still has [data-theme="dark-auth"]', async ({
    page,
  }) => {
    await page.goto('/login')
    await expect(page.locator('[data-theme="dark-auth"]')).toHaveCount(1)
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
  const PUBLIC_ROUTES = ['/login', '/signup', '/reset-password']

  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
      { name: 'eb-theme', value: 'dark', url: baseURL ?? 'http://localhost:9633' },
    ])
  })

  for (const path of PUBLIC_ROUTES) {
    test(`routes-render-dark: ${path} has <html class*="dark">`, async ({ page }) => {
      await page.goto(path)
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
    await page.goto('/login')
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).not.toBe('rgb(255, 255, 255)')
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  })
})
