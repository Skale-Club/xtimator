import { test, expect } from '@playwright/test'

/**
 * Phase 18 P18-02 + P18-09: full-screen route group escapes the app shell on all viewports.
 * Skips if no test session fixture is available (E2E_USE_SESSION env var).
 *
 * App-shell test-ids (app-sidebar, app-topbar, bottom-nav, mobile-header) are added
 * unconditionally in Phase 18 plan 03 task 3 — without these, count()==0 assertions
 * would pass trivially against missing-element selectors (false-positive shell-escape verification).
 */

test.describe('@phase-18 capture fullscreen shell', () => {
  test.skip(
    !process.env.E2E_USE_SESSION,
    'Requires E2E_USE_SESSION + a seeded draft project — see tests/e2e/README or run with seed.',
  )

  test('does not render the app sidebar/topbar/bottom-nav/mobile-header', async ({ page }) => {
    const projectId = process.env.E2E_PROJECT_ID
    test.skip(!projectId, 'E2E_PROJECT_ID env var must point at a seeded draft project')
    await page.goto(`/projects/${projectId}/capture`)

    // Capture surface is rendered (positive assertion — guards against false-positive
    // shell-escape verification when the page itself fails to load)
    await expect(page.locator('[data-testid="capture-screen"]')).toBeVisible()
    await expect(page.locator('[data-testid="capture-mic"]')).toBeVisible()

    // Shell components must NOT be present (the (capture) route group escapes the app shell).
    // These selectors only become meaningful because Task 3 step 1 added test-ids to the four shell components.
    expect(await page.locator('[data-testid="app-sidebar"]').count()).toBe(0)
    expect(await page.locator('[data-testid="app-topbar"]').count()).toBe(0)
    expect(await page.locator('[data-testid="bottom-nav"]').count()).toBe(0)
    expect(await page.locator('[data-testid="mobile-header"]').count()).toBe(0)
  })

  test('/projects/[id]/capture unauthenticated visit redirects to /?auth=login', async ({ page }) => {
    // Smoke test: verifies the route exists and auth is enforced.
    await page.goto('/projects/test-noop/capture')
    await expect(page).toHaveURL(/\/\?auth=login/)
  })
})
