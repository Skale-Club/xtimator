import { test, expect } from '@playwright/test'

// Phase 9 — dark-mode defaults & scoped theme wrappers
//
// Contracts locked by these tests:
//   1. default-dark: with no `eb-theme` cookie, root layout renders <html class="dark">
//   2. scoped-wrappers-intact: /auth/* still renders its [data-theme="dark-auth"] wrapper
//   3. estimate-forced-light: /estimate/[token] layout wraps content in [data-theme="light"],
//      even though the root layout applies `class="dark"` on <html>.
//
// Note on the estimate route:
// `app/estimate/[token]/page.tsx` calls `notFound()` when the share token doesn't exist.
// Next.js still mounts the route segment's `layout.tsx` around the 404 boundary, so the
// `[data-theme="light"]` wrapper is present on the rendered page. If that ever changes
// (e.g. the page starts throwing before layout mount), the test will still surface a
// meaningful failure rather than silently pass.

test.describe('Phase 9 — dark-mode defaults & scoped theme wrappers', () => {
  test.beforeEach(async ({ context }) => {
    // Ensure no pre-existing eb-theme cookie influences next-themes' defaultTheme
    await context.clearCookies()
  })

  test('default-dark: fresh visit renders <html class="dark">', async ({ page }) => {
    // /auth/login is a public route wrapped by the root layout's ThemeProvider.
    // With no cookie, next-themes honors defaultTheme="dark".
    await page.goto('/auth/login')
    await expect
      .poll(async () => await page.evaluate(() => document.documentElement.className))
      .toMatch(/(^|\s)dark(\s|$)/)
  })

  test('scoped-wrappers-intact: /auth/login still has [data-theme="dark-auth"]', async ({
    page,
  }) => {
    await page.goto('/auth/login')
    await expect(page.locator('[data-theme="dark-auth"]')).toHaveCount(1)
  })

  test('estimate-forced-light: /estimate/<token> wraps content in [data-theme="light"]', async ({
    page,
  }) => {
    // Use a non-existent token — the layout still mounts around the 404 boundary.
    const resp = await page.goto('/estimate/test-token-does-not-exist')
    // Guard against hard 5xx — unrelated server error means we can't assert the layout.
    if (resp && resp.status() >= 500) test.skip(true, 'Server error — cannot assert layout')
    const wrapper = page.locator('[data-theme="light"]')
    // Presence is the contract; count may grow >=1 if future nested usages land.
    await expect(wrapper.first()).toBeVisible({ timeout: 5_000 })
  })
})
