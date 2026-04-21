import { test, expect } from '@playwright/test'

test.describe('Auth dark pass (ADMIN-12)', () => {
  for (const path of ['/auth/login', '/auth/signup', '/auth/reset-password']) {
    test(`${path} has [data-theme="dark-auth"] wrapper`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('[data-theme="dark-auth"]')).toHaveCount(1)
    })

    test(`${path} body has no "EstimateBuilder Pro" literal`, async ({ page }) => {
      // Scope: Plan 07 only owns the (auth) tree + components/auth/. The
      // root app/layout.tsx <title> metadata sweep is owned by Plan 08.
      // We assert on the dark-auth wrapper subtree (visible body), not
      // the document <head> metadata, to keep this test plan-scoped.
      await page.goto(path)
      const subtreeHtml = await page
        .locator('[data-theme="dark-auth"]')
        .innerHTML()
      expect(subtreeHtml).not.toContain('EstimateBuilder Pro')
    })
  }
})
