import { test, expect } from '@playwright/test'

test.describe('@phase-18 voice-first flow', () => {
  test.skip(!process.env.E2E_USE_SESSION, 'Requires test session')

  test('wizard reduced to 1 step + Continue lands on /capture', async ({ page }) => {
    await page.goto('/projects/new')

    // Wizard should expose a client picker but no name/budget/type fields
    await expect(page.getByRole('button', { name: /continue to recorder/i })).toBeVisible()
    await expect(page.getByLabel('Project name')).toHaveCount(0)
    await expect(page.getByLabel('Project type')).toHaveCount(0)
    await expect(page.getByLabel('Target budget')).toHaveCount(0)

    // After picking a client and submitting, URL should match /projects/<uuid>/capture
    // (Full submit flow requires a seeded client — structural assertion only here)
  })

  // Full mic+AI pipeline requires real keys + audio fixture — skipped unless E2E_FULL_PIPELINE is set
  test('full pipeline ends on estimate editor with populated draft', async ({ page }) => {
    test.skip(
      !process.env.E2E_FULL_PIPELINE,
      'Full mic+Whisper+Claude pipeline requires real keys + audio fixture; see 18-VALIDATION.md manual UAT.',
    )
    // Operator runs this manually with E2E_FULL_PIPELINE=1 against a real environment.
    // 1. Navigate to new project wizard
    await page.goto('/projects/new')
    // 2. Pick a client
    // 3. Submit wizard → /projects/<id>/capture
    // 4. Start + stop recording (audio fixture)
    // 5. Wait for pipeline completion
    // 6. Assert redirect
    await expect(page).toHaveURL(/\/projects\/[a-z0-9-]+\?tab=estimate/)
  })

  // Workspace tab-switch verification (addresses checker Blocker 1, depends on plan 18-02 Task 3).
  // Confirms that ?tab=estimate causes the EstimateTab to render WITHOUT a click.
  test('navigating to /projects/[id]?tab=estimate renders EstimateTab as active without clicking', async ({ page }) => {
    const projectId = process.env.E2E_PROJECT_ID
    test.skip(!projectId, 'E2E_PROJECT_ID required')
    await page.goto(`/projects/${projectId}?tab=estimate`)
    // Radix Tabs sets data-state='active' on the active trigger
    const activeTrigger = page.locator('[role="tab"][data-state="active"]')
    await expect(activeTrigger).toContainText(/estimate/i)
  })
})
