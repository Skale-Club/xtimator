// Wave 0 scaffold — RED until Phase 18 plan 01 task 3 creates the capture shell with Skip button.
// Full e2e test passes in Phase 18 plan 03 task 3 (finalize e2e + phase gate).
// Covers P18-08 (Skip recording escape hatch routes to /projects/[id]).

import { test, expect } from '@playwright/test'

test.describe('skip recording escape hatch (P18-08)', () => {
  test.skip(true, 'Wave 0 scaffold — requires authenticated session + real project id. Activated in Phase 18 plan 03 task 3.')

  test('Skip recording on /capture routes to /projects/[id]', async ({ page }) => {
    // Requires: authenticated session + a known project id.
    // The capture page shell (plan 18-01 task 3) renders a "Skip recording" button.
    // Clicking it routes to /projects/[id] (overview/workspace).

    // Navigate to a capture page (test project pre-seeded)
    const projectId = process.env.E2E_TEST_PROJECT_ID ?? 'test-noop'
    await page.goto(`/projects/${projectId}/capture`)

    // Click Skip recording button
    await page.getByTestId('skip-recording').click()

    // Assert redirect to /projects/[id] workspace
    await expect(page).toHaveURL(`/projects/${projectId}`)
  })
})
