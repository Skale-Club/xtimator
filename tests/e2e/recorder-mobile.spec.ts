import { test, expect } from '@playwright/test'

// This test suite targets both mobile-safari and mobile-chrome Playwright projects.
// Run with: npx playwright test tests/e2e/recorder-mobile.spec.ts --project=mobile-safari
//       or: npx playwright test tests/e2e/recorder-mobile.spec.ts --project=mobile-chrome

test.describe('@phase-18 mobile recorder', () => {
  test.skip(
    !process.env.E2E_USE_SESSION || !process.env.E2E_PROJECT_ID,
    'Requires session + seeded project',
  )

  test('mic button is in the lower half of the viewport', async ({ page }, _testInfo) => {
    const projectId = process.env.E2E_PROJECT_ID!
    await page.goto(`/projects/${projectId}/capture`)

    const mic = page.locator('[data-testid="capture-mic"]')
    await expect(mic).toBeVisible()
    const box = await mic.boundingBox()
    const viewport = page.viewportSize() ?? { width: 0, height: 0 }
    expect(box).not.toBeNull()
    expect(box!.y + box!.height / 2).toBeGreaterThan(viewport.height * 0.5)
  })

  test('timer is visible at 320px width', async ({ page }) => {
    const projectId = process.env.E2E_PROJECT_ID!
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto(`/projects/${projectId}/capture`)
    await expect(page.locator('[data-testid="capture-timer"]')).toBeVisible()
  })
})
