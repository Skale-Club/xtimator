import { test, expect } from '@playwright/test'

/**
 * REQ ADMIN-03: /admin/admins — list, add, remove platform admins.
 *
 * Env-gated: requires TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD for an account
 * that's already in platform_admins (per supabase/ADMIN-BOOTSTRAP.md).
 *
 * Primary case: opening the dialog and submitting a known-bad email surfaces the
 * UI-SPEC inline error copy ("No user registered with that email…"). This proves
 * the full server-action → action-result → inline-error wire-up without needing
 * a second test user.
 */
test.describe('Admin admins (ADMIN-03)', () => {
  test.skip(
    !process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD,
    'Set TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD to run admin-admins e2e'
  )

  test('dialog surfaces inline error for unknown email', async ({ page }) => {
    await page.goto('/?auth=login')
    await page.waitForSelector('[role="dialog"]')
    await page.fill('input[name="email"]', process.env.TEST_ADMIN_EMAIL!)
    await page.getByRole('button', { name: /^Continue$/ }).click()
    await page.fill('input[name="password"]', process.env.TEST_ADMIN_PASSWORD!)
    await page.getByRole('button', { name: /^Sign in$/ }).click()
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10000 })

    await page.goto('/admin/admins')

    // Open the Add dialog. The trigger button label is "Add admin"; the submit
    // button inside the dialog is also "Add admin", so we scope by role + name.
    await page.getByRole('button', { name: /^add admin$/i }).first().click()

    // Type a guaranteed-unknown email and submit.
    await page.fill('input[name="email"]', `nobody-${Date.now()}@example.test`)
    await page
      .getByRole('button', { name: /^add admin$/i })
      .last() // the submit inside the dialog (after the trigger)
      .click()

    // Inline error from the server action's "No user registered…" branch.
    await expect(page.getByText(/No user registered/i)).toBeVisible()
  })
})
