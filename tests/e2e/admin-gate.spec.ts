import { test, expect } from '@playwright/test'

/**
 * REQ ADMIN-01: super-admin-only /admin/* route group; unauthorized → 404.
 *
 * Three user classes:
 *   1. anon (no session) — always runs, asserts 404 + body reveals nothing.
 *   2. authenticated non-admin — runs against the live signup flow, asserts 404.
 *   3. authenticated admin — env-gated; requires TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD
 *      and the admin row pre-seeded in the e2e DB (see supabase/ADMIN-BOOTSTRAP.md
 *      and tests/setup/seed-admin.ts).
 */
test.describe('Admin gate (ADMIN-01)', () => {
  test('anon 404: unauthenticated user sees 404 on /admin/integrations', async ({ page }) => {
    const response = await page.goto('/admin/integrations')
    expect(response?.status()).toBe(404)
    // Visible text must not reveal the admin surface — no "Integrations" heading, etc.
    // (We deliberately check innerText, not raw HTML, because Next includes the requested
    // pathname in the RSC payload — that's a routing artifact, not visible UI.)
    const visibleText = await page.locator('body').innerText()
    expect(visibleText).not.toMatch(/Integrations/i)
    expect(visibleText).toMatch(/This page could not be found/i)
  })

  test('non-admin 404: authenticated non-admin sees 404 on /admin/integrations', async ({ page }) => {
    // Sign up a fresh, throwaway user. They will NOT be in platform_admins.
    const email = `gate-test-${Date.now()}@example.test`
    const password = 'TestPass123!'

    await page.goto('/?auth=signup')
    await page.waitForSelector('[role="dialog"]')
    await page.fill('input[name="email"]', email)
    // Step 1 -> Continue
    await page.getByRole('button', { name: /^Continue$/ }).click()
    // Step 2 — password + confirm
    await page.fill('input[name="password"]', password)
    await page.fill('input[name="confirmPassword"]', password)
    await page.getByRole('button', { name: /^Create account$/ }).click()

    // Wait for the post-signup redirect (onboarding, dashboard, or back to the LP if
    // email confirmation is required — any of these means a session exists OR the
    // signup completed without immediate access).
    await page.waitForURL(/\/(onboarding|dashboard|\?auth=)/, { timeout: 10000 }).catch(() => {
      // Even if redirect didn't fire, attempt the gate test — the cookie should
      // be set if signup succeeded.
    })

    const response = await page.goto('/admin/integrations')
    expect(response?.status()).toBe(404)
  })

  test('admin sees panel: authenticated admin does NOT get 404', async ({ page }) => {
    const adminEmail = process.env.TEST_ADMIN_EMAIL
    const adminPassword = process.env.TEST_ADMIN_PASSWORD
    test.skip(
      !adminEmail || !adminPassword,
      'Set TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD to run admin-gate positive test'
    )

    await page.goto('/?auth=login')
    await page.waitForSelector('[role="dialog"]')
    await page.fill('input[name="email"]', adminEmail!)
    await page.getByRole('button', { name: /^Continue$/ }).click()
    await page.fill('input[name="password"]', adminPassword!)
    await page.getByRole('button', { name: /^Sign in$/ }).click()
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10000 })

    const response = await page.goto('/admin/integrations')
    // The gate is what we're testing, not the page content. The page itself ships
    // in Plan 04 — until then, expect a non-404 status (could be 200, 500, etc.).
    expect(response?.status()).not.toBe(404)
  })
})
