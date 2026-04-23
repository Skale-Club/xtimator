import { expect, test } from '@playwright/test'

test.describe('landing page', () => {
  test('hero', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Turn a job-site walkthrough into a client-ready estimate in minutes.' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Start free' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
  })

  test.fixme('how it works', async () => {
    // Activated in Plan 11-01 Task 2 once the remaining landing sections ship.
  })

  test.fixme('features', async () => {
    // Activated in Plan 11-01 Task 2 once the benefits grid ships.
  })

  test('unauthenticated root', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveURL('/')
    await expect(page).not.toHaveURL(/\/auth\/login$/)
  })

  test('authenticated root redirect', async ({ page }) => {
    const adminEmail = process.env.TEST_ADMIN_EMAIL
    const adminPassword = process.env.TEST_ADMIN_PASSWORD

    test.skip(
      !adminEmail || !adminPassword,
      'Set TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD to run authenticated root redirect test'
    )

    await page.goto('/auth/login')
    await page.fill('input[name="email"]', adminEmail!)
    await page.fill('input[name="password"]', adminPassword!)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10000 })

    await page.goto('/')
    await expect(page).toHaveURL('/dashboard')
  })
})
