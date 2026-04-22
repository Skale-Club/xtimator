import { test, expect } from '@playwright/test'

// These tests assume the project has a helper to sign in a test user.
// If no helper exists, each test auto-skips when /onboarding redirects to /auth/login.
// The survey UI behavior is also covered by unit tests around useSurveyState +
// SurveyProgress (tests/unit/components/onboarding-survey.test.tsx).
test.describe('Onboarding survey — keyboard + progress + back', () => {
  test('progress indicator shows "Step 1 of N" on initial render', async ({ page }) => {
    await page.goto('/onboarding')
    if (page.url().includes('/auth/login')) {
      test.skip(true, 'No test auth helper configured for /onboarding')
    }
    await expect(page.getByText(/Step 1 of \d+/)).toBeVisible()
  })

  test('cannot advance past company-name step with empty value', async ({ page }) => {
    await page.goto('/onboarding')
    if (page.url().includes('/auth/login')) {
      test.skip(true, 'No test auth helper configured for /onboarding')
    }
    const next = page.getByRole('button', { name: 'Next' })
    await next.click()
    // Still on step 1 — progress text unchanged
    await expect(page.getByText(/Step 1 of \d+/)).toBeVisible()
  })

  test('Enter key advances when current step is valid', async ({ page }) => {
    await page.goto('/onboarding')
    if (page.url().includes('/auth/login')) {
      test.skip(true, 'No test auth helper configured for /onboarding')
    }
    const input = page.locator('#survey-company-name')
    await input.fill('Acme Co')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/Step 2 of \d+/)).toBeVisible()
  })

  test('Back button preserves previously entered value', async ({ page }) => {
    await page.goto('/onboarding')
    if (page.url().includes('/auth/login')) {
      test.skip(true, 'No test auth helper configured for /onboarding')
    }
    const input = page.locator('#survey-company-name')
    await input.fill('Acme Co')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.locator('#survey-company-name')).toHaveValue('Acme Co')
  })
})
