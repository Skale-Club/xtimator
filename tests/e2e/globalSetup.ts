// Playwright globalSetup: signs in via Supabase Auth and saves storageState
// to tests/e2e/fixtures/authenticated-state.json so tour-flow tests can
// access /dashboard without being redirected to /login.
//
// Requires TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local.
// Guard: if env vars are missing, exits without error — tests fall back to
// the existing requireDashboard skip guard.

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
    await page.goto('http://localhost:9633/login')
    await page.waitForLoadState('networkidle')

    // Fill login form — selector matches app/(auth)/login/page.tsx
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')

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
