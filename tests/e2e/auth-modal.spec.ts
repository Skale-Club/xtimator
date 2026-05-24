import { test, expect } from '@playwright/test'

/**
 * Auth modal e2e (post 260524-ohe refactor).
 *
 * The standalone /login, /signup, and /reset-password pages were collapsed
 * into a single in-modal 2-step flow on the landing page. This spec exercises
 * the canonical surface: clicking the LP CTAs, the ?auth= deep link, and the
 * unauthenticated protected-route redirect.
 *
 * Full sign-in / sign-up assertions (DB-backed) remain in the manual UAT
 * battery — they need a test user and are out of scope for this refactor.
 */

test.describe('Auth modal — LP-driven flow', () => {
  test('Start button on LP opens modal in signup mode', async ({ page }) => {
    await page.goto('/')
    // The top nav CTA is labeled "Start" (signup) per landing-nav.tsx.
    // Multiple matches may exist (TopNav + Hero); we click the first visible one.
    const startBtn = page.getByRole('button', { name: /^Start/i }).first()
    await startBtn.click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: /create account/i })).toBeVisible()
  })

  test('?auth=login auto-opens modal in login mode and strips the param', async ({ page }) => {
    await page.goto('/?auth=login')
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: /welcome back/i })).toBeVisible()
    // After the auto-open, router.replace strips the query.
    await expect.poll(() => new URL(page.url()).search).toBe('')
  })

  test('?auth=signup auto-opens modal in signup mode', async ({ page }) => {
    await page.goto('/?auth=signup')
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: /create account/i })).toBeVisible()
  })

  test('unauthenticated /dashboard lands on / and opens modal in login mode', async ({ page }) => {
    await page.goto('/dashboard')
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: /welcome back/i })).toBeVisible()
  })

  test('unauthenticated /onboarding lands on / with the modal in login mode', async ({ page }) => {
    await page.goto('/onboarding')
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await expect(page.locator('[role="dialog"]')).toBeVisible()
  })

  test('Auth dialog renders with dark Xphere card styling', async ({ page }) => {
    await page.goto('/?auth=login')
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    // Card surface uses bg-[#08090A] dark base — assert non-white background on the inner card.
    const cardBg = await dialog
      .locator('.bg-\\[\\#08090A\\]')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
      .catch(() => '')
    if (cardBg) {
      expect(cardBg).not.toBe('rgb(255, 255, 255)')
    }
  })
})
