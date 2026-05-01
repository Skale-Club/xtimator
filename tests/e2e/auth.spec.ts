import { test, expect } from '@playwright/test'

// APP_NAME_E2E is set in CI to match the seeded platform_branding row.
// Falls back to 'Xtimator' (the default seeded branding value from Plan 01).
const APP_NAME = process.env.APP_NAME_E2E ?? 'Xtimator'

test.describe('signup', () => {
  test('signup page renders correctly', async ({ page }) => {
    await page.goto('/signup')
    // Wordmark now sourced from getBranding() — env-driven via APP_NAME_E2E (Phase 8 rebrand)
    await expect(page.getByText(APP_NAME)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
  })
})

test.describe('login', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText(APP_NAME)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByText("Forgot your password?")).toBeVisible()
  })
})

test.describe('google-oauth', () => {
  test('Google OAuth button is visible and above the separator', async ({ page }) => {
    await page.goto('/login')
    const googleBtn = page.getByRole('button', { name: 'Continue with Google' })
    const separator = page.getByText('or')
    await expect(googleBtn).toBeVisible()
    await expect(separator).toBeVisible()
    // Google button appears before separator in DOM (D-03)
    const googleBtnBox = await googleBtn.boundingBox()
    const separatorBox = await separator.boundingBox()
    expect(googleBtnBox!.y).toBeLessThan(separatorBox!.y)
  })
})

test.describe('session', () => {
  test('unauthenticated visit to /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login')
  })

  test('unauthenticated visit to /onboarding redirects to /login', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page).toHaveURL('/login')
  })
})

test.describe('reset-password', () => {
  test('reset password page renders request form', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})

test.describe('onboarding-redirect', () => {
  test.skip('new user with no company record is redirected to /onboarding after signup (AUTH-06) — requires live Supabase', async () => {})
})

test.describe('signout', () => {
  test.skip('user can sign out and is redirected to /login (AUTH-07) — requires authenticated session', async () => {})
})
