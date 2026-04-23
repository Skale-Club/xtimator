import { expect, test } from '@playwright/test'

test.describe('landing page', () => {
  test('hero', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Turn a job-site walkthrough into a client-ready estimate in minutes.' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Start free' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
  })

  test('how it works', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Record audio' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Add photos' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Get estimate' })).toBeVisible()
  })

  test('features', async ({ page }) => {
    await page.goto('/')

    const firstFeature = page.getByRole('heading', { name: 'AI-generated estimate draft' })

    await firstFeature.scrollIntoViewIfNeeded()
    await expect(firstFeature).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Branded PDF output' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Share link for fast approvals' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mobile-first from the driveway' })).toBeVisible()
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
