// Playwright globalSetup: signs in via Supabase Auth and saves storageState
// to tests/e2e/fixtures/authenticated-state.json so tour-flow tests can
// access /dashboard without being redirected to /?auth=login.
//
// Requires TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local.
// Guard: if env vars are missing, exits without error — tests fall back to
// the existing requireDashboard skip guard.
//
// Post 260524-ohe: sign-in happens via the LP modal at /?auth=login.

import { chromium } from '@playwright/test'
import path from 'path'

export default async function globalSetup() {
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD

  if (!email || !password) {
    console.warn('[globalSetup] TEST_USER_EMAIL or TEST_USER_PASSWORD not set — skipping auth fixture population. Tour tests will use requireDashboard skip fallback.')
    return
  }

  const browser = await chromium.launch()
  const page = await browser.newPage()

  try {
    await page.goto('http://localhost:9633/?auth=login')
    await page.waitForSelector('[role="dialog"]')

    // Step 1: email + Continue (modal Step 1)
    await page.fill('input[type="email"]', email)
    await page.getByRole('button', { name: /^Continue$/ }).click()

    // Step 2: password + Sign in
    await page.fill('input[type="password"]', password)
    await page.getByRole('button', { name: /^Sign in$/ }).click()

    // Wait for redirect to /dashboard or /onboarding after successful login
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15000 })

    // Save the authenticated session cookies + localStorage
    const storageStatePath = path.join(process.cwd(), 'tests/e2e/fixtures/authenticated-state.json')
    await page.context().storageState({ path: storageStatePath })
    console.log('[globalSetup] Authenticated state saved to', storageStatePath)
  } catch (err) {
    console.warn('[globalSetup] Auth sign-in failed — tour tests will skip via requireDashboard:', err)
  } finally {
    await browser.close()
  }
}
