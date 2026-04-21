import { test, expect } from '@playwright/test'

test.describe('Auth dark pass (ADMIN-12)', () => {
  for (const path of ['/auth/login', '/auth/signup', '/auth/reset-password']) {
    test(`${path} has [data-theme="dark-auth"] wrapper`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('[data-theme="dark-auth"]')).toHaveCount(1)
    })

    test(`${path} has no "EstimateBuilder Pro" literal`, async ({ page }) => {
      await page.goto(path)
      const html = await page.content()
      expect(html).not.toContain('EstimateBuilder Pro')
    })
  }
})
