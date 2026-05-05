// Wave 0 scaffold — RED until Phase 18 plan 01 task 3 creates (capture) route group.
// Full e2e test passes in Phase 18 plan 03 task 3 (finalize e2e + phase gate).
// Covers P18-02 (full-screen surface) + P18-09 (mobile).

import { test, expect } from '@playwright/test'

test.describe('/projects/[id]/capture — fullscreen shell escape', () => {
  test.skip(true, 'Wave 0 scaffold — unauthenticated smoke only; full tests land in Phase 18 plan 03 task 3')

  test('/projects/[id]/capture renders without sidebar/topbar', async ({ page }) => {
    // Requires: authenticated session + real project id.
    // Unauthenticated access will redirect to /login (expected).
    // This test will be activated (skip removed) in Phase 18 plan 03 task 3.
    await page.goto('/projects/test-noop/capture')

    // Assert app shell elements are NOT present (fullscreen escape).
    await expect(page.locator('[data-testid="app-sidebar"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="app-topbar"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="bottom-nav"]')).toHaveCount(0)
  })

  test('/projects/[id]/capture unauthenticated visit redirects to /login', async ({ page }) => {
    // Smoke test: verifies the route exists and auth is enforced.
    await page.goto('/projects/test-noop/capture')
    await expect(page).toHaveURL('/login')
  })
})
