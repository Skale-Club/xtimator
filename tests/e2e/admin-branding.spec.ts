import { test, expect } from '@playwright/test'

/**
 * /admin/branding e2e (ADMIN-08).
 *
 * Gated on TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD: the admin must already be
 * present in the platform_admins table per supabase/ADMIN-BOOTSTRAP.md.
 *
 * Teardown: this spec only verifies round-trip persistence. The default
 * Xtimator branding is restored externally via:
 *   psql ... -c "UPDATE platform_branding SET app_name='Xtimator' WHERE id=1"
 * or by re-running the migration. A future Plan 06 admin-restore helper may
 * automate this.
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD

test.describe('Admin branding (ADMIN-08)', () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'Set TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD to run admin-branding e2e'
  )

  test('admin can edit app_name and see it persist after reload', async ({ page }) => {
    const newName = `Xtimator Test ${Date.now()}`

    // Login flow.
    await page.goto('/auth/login')
    await page.fill('input[name="email"]', ADMIN_EMAIL!)
    await page.fill('input[name="password"]', ADMIN_PASSWORD!)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(dashboard|admin)/)

    // Open branding page.
    await page.goto('/admin/branding')
    const input = page.locator('input[name="appName"]')
    await expect(input).toBeVisible()

    // Edit and save.
    await input.fill(newName)
    await page.getByRole('button', { name: /save branding/i }).click()
    await expect(
      page.locator('[role="status"]', { hasText: 'Branding updated.' })
    ).toBeVisible({ timeout: 10_000 })

    // Reload and verify persistence.
    await page.reload()
    await expect(page.locator('input[name="appName"]')).toHaveValue(newName)
  })

  test.afterAll(async () => {
    // TODO(08-06): wire a service-role teardown that resets app_name to "Xtimator".
    // Currently relies on operator running:
    //   psql $DATABASE_URL -c "UPDATE platform_branding SET app_name='Xtimator' WHERE id=1"
  })
})
