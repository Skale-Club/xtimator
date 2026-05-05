import { test, expect } from '@playwright/test'

test.describe('@phase-18 skip recording escape hatch', () => {
  test.skip(!process.env.E2E_USE_SESSION, 'Requires session + seeded draft project')

  test('clicking Skip recording navigates to /projects/[id]', async ({ page }) => {
    const projectId = process.env.E2E_PROJECT_ID
    test.skip(!projectId, 'E2E_PROJECT_ID env required')
    await page.goto(`/projects/${projectId}/capture`)
    await page.locator('[data-testid="skip-recording"]').click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
  })
})
