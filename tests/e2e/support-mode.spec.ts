import { test, expect } from '@playwright/test'

/**
 * SUPPORT-01/SUPPORT-02: super admin enters Support Mode from the Companies
 * list and sees the persistent identity banner while impersonating.
 * Env-gated like admin-gate.spec.ts — requires TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD
 * and at least one company row to exist in the e2e DB.
 *
 * Runtime dependency note: the banner-visibility assertion below depends on
 * Plan 02's SupportModeBanner (components/admin/support-mode-banner.tsx) and
 * its app/(app)/layout.tsx wiring. This plan's frontmatter declares
 * depends_on: ["151-01", "151-02"] specifically so this spec only runs
 * against a build where Plan 02 has already completed.
 */
test.describe('Support Mode (SUPPORT-01, SUPPORT-02)', () => {
  test('admin enters Support Mode from Companies list, sees banner, exits back to /admin/companies', async ({ page }) => {
    const adminEmail = process.env.TEST_ADMIN_EMAIL
    const adminPassword = process.env.TEST_ADMIN_PASSWORD
    test.skip(
      !adminEmail || !adminPassword,
      'Set TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD to run Support Mode e2e test'
    )

    await page.goto('/?auth=login')
    await page.waitForSelector('[role="dialog"]')
    await page.fill('input[name="email"]', adminEmail!)
    await page.getByRole('button', { name: /^Continue$/ }).click()
    await page.fill('input[name="password"]', adminPassword!)
    await page.getByRole('button', { name: /^Sign in$/ }).click()
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10000 })

    await page.goto('/admin/companies')
    const viewAsCompanyLink = page.getByRole('button', { name: /View as Company/ }).first()
    test.skip(
      (await viewAsCompanyLink.count()) === 0,
      'No companies with a View as Company row action found — seed at least one company for this e2e test'
    )
    await viewAsCompanyLink.click()

    await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/Viewing/)

    await page.getByRole('button', { name: /Exit view/ }).click()
    await page.waitForURL(/\/admin\/companies/, { timeout: 10000 })
  })
})
