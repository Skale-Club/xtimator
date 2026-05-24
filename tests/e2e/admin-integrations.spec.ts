import { test, expect } from '@playwright/test'

/**
 * REQ ADMIN-04 / ADMIN-10: /admin/integrations end-to-end.
 *
 * Env-gated: requires TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD set, and the
 * corresponding auth.users row pre-seeded into platform_admins (per
 * supabase/ADMIN-BOOTSTRAP.md). The admin must NOT have a real Resend key
 * already configured — the test will SAVE then DELETE a placeholder key.
 *
 * Flow:
 *   1. Login as admin
 *   2. Navigate to /admin/integrations
 *   3. Assert three provider cards are visible (Resend, Anthropic, OpenAI)
 *   4. Type sk-test-placeholder into Resend input, click "Save key"
 *   5. Assert toast "Resend key saved." visible
 *   6. Assert badge flips to "Connected" and footer shows "Last updated"
 *   7. Cleanup: delete the placeholder key via the UI's Delete flow
 */
test.describe('/admin/integrations end-to-end (ADMIN-04, ADMIN-10)', () => {
  test('admin can save then delete a Resend placeholder key', async ({ page }) => {
    const adminEmail = process.env.TEST_ADMIN_EMAIL
    const adminPassword = process.env.TEST_ADMIN_PASSWORD
    test.skip(
      !adminEmail || !adminPassword,
      'Set TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD to run /admin/integrations e2e'
    )

    // 1) Login as admin via the LP modal (post 260524-ohe)
    await page.goto('/?auth=login')
    await page.waitForSelector('[role="dialog"]')
    await page.fill('input[name="email"]', adminEmail!)
    await page.getByRole('button', { name: /^Continue$/ }).click()
    await page.fill('input[name="password"]', adminPassword!)
    await page.getByRole('button', { name: /^Sign in$/ }).click()
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10000 })

    // 2) Navigate to /admin/integrations
    await page.goto('/admin/integrations')

    // 3) Three provider cards visible
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible()
    await expect(page.getByText('Resend', { exact: true })).toBeVisible()
    await expect(page.getByText('Anthropic', { exact: true })).toBeVisible()
    await expect(page.getByText('OpenAI', { exact: true })).toBeVisible()

    // 4) Find the Resend card by locating its title heading and walking up to the card.
    const resendCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: 'Resend' })
      .first()
    await resendCard.locator('input').first().fill('sk-test-placeholder')
    await resendCard.getByRole('button', { name: /Save key/i }).click()

    // 5) Toast "Resend key saved."
    await expect(page.getByText(/Resend key saved\./i)).toBeVisible({
      timeout: 10000,
    })

    // 6) Badge → "Connected"; footer shows "Last updated"
    await expect(resendCard.getByText('Connected')).toBeVisible({ timeout: 5000 })
    await expect(resendCard.getByText(/Last updated/i)).toBeVisible()

    // 7) Cleanup: open Delete confirm + confirm
    await resendCard.getByRole('button', { name: /Delete key/i }).click()
    // Confirm in the AlertDialog (a destructive "Delete key" action button)
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /Delete key/i })
      .click()
    await expect(page.getByText(/Resend key removed\./i)).toBeVisible({
      timeout: 10000,
    })
  })
})
