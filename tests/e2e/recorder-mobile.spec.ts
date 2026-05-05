// Wave 0 scaffold — RED until Phase 18 plan 02 implements full-screen CaptureRecorder.
// Full e2e test passes in Phase 18 plan 03 task 3 (finalize e2e + phase gate).
// Covers P18-09 (recorder works on iOS Safari and Android Chrome at all breakpoints).
// Playwright projects: mobile-safari (iPhone 13) + mobile-chrome (Pixel 7) defined in playwright.config.ts.

import { test, expect } from '@playwright/test'

// This test suite targets both mobile-safari and mobile-chrome Playwright projects.
// Run with: npx playwright test tests/e2e/recorder-mobile.spec.ts --project=mobile-safari
//       or: npx playwright test tests/e2e/recorder-mobile.spec.ts --project=mobile-chrome

test.describe('recorder mobile layout (P18-09)', () => {
  test.skip(true, 'Wave 0 scaffold — requires authenticated session + capture route. Activated in Phase 18 plan 03 task 3.')

  test('mic button visible and within bottom 1/3 of viewport on iPhone 13', async ({ page }) => {
    // Requires: authenticated session + real project id + mobile-safari Playwright project.
    // iPhone 13 viewport: 390x844 (Playwright devices['iPhone 13']).
    const projectId = process.env.E2E_TEST_PROJECT_ID ?? 'test-noop'
    await page.goto(`/projects/${projectId}/capture`)

    const micButton = page.getByTestId('mic-button')
    await expect(micButton).toBeVisible()

    const box = await micButton.boundingBox()
    const viewportSize = page.viewportSize()!

    // Thumb-reachable: mic button center Y should be in bottom 1/3 of viewport
    const buttonCenterY = box!.y + box!.height / 2
    const bottomThirdStart = viewportSize.height * (2 / 3)
    expect(buttonCenterY).toBeGreaterThanOrEqual(bottomThirdStart)
  })

  test('capture screen is readable at 320px width (minimum mobile breakpoint)', async ({ page }) => {
    // Set viewport to 320px (minimum supported breakpoint from D-17)
    await page.setViewportSize({ width: 320, height: 568 })
    const projectId = process.env.E2E_TEST_PROJECT_ID ?? 'test-noop'
    await page.goto(`/projects/${projectId}/capture`)

    const captureScreen = page.getByTestId('capture-screen')
    await expect(captureScreen).toBeVisible()
  })
})
