import { test, expect } from '@playwright/test'

/**
 * Phase 77 (NOTIF-12) — Full notifications end-to-end.
 *
 * Env-gated: requires TEST_USER_EMAIL + TEST_USER_PASSWORD set, plus a
 * test-only dispatch endpoint `POST /api/notifications/test-dispatch`
 * (TEST_NOTIF_DISPATCH=1 in env). When either is missing the spec is
 * skipped — matches the pattern used by tests/e2e/admin-integrations.spec.ts.
 *
 * Flow:
 *  1. Login
 *  2. Visit /dashboard — bell visible, badge=0
 *  3. Trigger dispatch (estimate.viewed) via test endpoint
 *  4. Within 5s, bell badge increments to "1" (Supabase Realtime)
 *  5. Click bell → panel opens → first item visible
 *  6. Click item → URL navigates + badge clears to 0
 *  7. Reload — badge still 0 (read_at persisted)
 *  8. Visit /notifications — row visible in Recent section
 *  9. Visit /settings/notifications → toggle estimate in_app off → Save
 *  10. Trigger again → bell does NOT increment
 */
test.describe('Notifications end-to-end (NOTIF-12)', () => {
  test('full trigger → bell badge → click → read → opt-out flow', async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL
    const password = process.env.TEST_USER_PASSWORD
    test.skip(
      !email || !password || process.env.TEST_NOTIF_DISPATCH !== '1',
      'Set TEST_USER_EMAIL + TEST_USER_PASSWORD + TEST_NOTIF_DISPATCH=1 to run notifications e2e',
    )

    // 1) Login via LP modal (post 260524-ohe)
    await page.goto('/?auth=login')
    await page.waitForSelector('[role="dialog"]')
    await page.fill('input[name="email"]', email!)
    await page.getByRole('button', { name: /^Continue$/ }).click()
    await page.fill('input[name="password"]', password!)
    await page.getByRole('button', { name: /^Sign in$/ }).click()
    await page.waitForURL(/\/(dashboard|capture|onboarding)/, { timeout: 10000 })

    // 2) Bell visible on dashboard
    await page.goto('/dashboard')
    const bell = page.getByTestId('notification-bell')
    await expect(bell).toBeVisible({ timeout: 5000 })

    // 3) Trigger dispatch via test endpoint
    const dispatch1 = await page.request.post('/api/notifications/test-dispatch', {
      data: {
        eventType: 'estimate.viewed',
        title: 'E2E test: estimate viewed',
        body: 'Triggered by playwright',
        linkUrl: '/dashboard',
      },
    })
    expect(dispatch1.ok()).toBe(true)

    // 4) Bell badge appears (Realtime)
    const badge = page.getByTestId('notification-bell-badge')
    await expect(badge).toBeVisible({ timeout: 5000 })
    await expect(badge).toHaveText(/^[1-9]/)

    // 5) Click bell, panel opens, first item visible
    await bell.click()
    await expect(page.getByText('E2E test: estimate viewed').first()).toBeVisible({
      timeout: 3000,
    })

    // 6) Click item navigates + clears badge
    await page.getByText('E2E test: estimate viewed').first().click()
    await page.waitForURL(/\/dashboard/, { timeout: 5000 })
    await expect(badge).toBeHidden({ timeout: 5000 })

    // 7) Reload — badge still 0 (persisted read_at)
    await page.reload()
    await expect(bell).toBeVisible()
    await expect(badge).toBeHidden({ timeout: 3000 })

    // 8) /notifications page — row visible
    await page.goto('/notifications')
    await expect(page.getByText('E2E test: estimate viewed').first()).toBeVisible({
      timeout: 5000,
    })

    // 9) Settings → opt-out estimate in_app
    await page.goto('/settings/notifications')
    await expect(page.getByText(/Notification preferences/i)).toBeVisible()
    const estimateInApp = page.getByTestId('pref-in_app-estimate')
    // Toggle off
    await estimateInApp.click()
    await page.getByTestId('save-prefs').click()
    await expect(page.getByText(/Notification preferences saved/i)).toBeVisible({
      timeout: 5000,
    })

    // 10) Trigger again — bell does NOT increment
    await page.goto('/dashboard')
    const dispatch2 = await page.request.post('/api/notifications/test-dispatch', {
      data: {
        eventType: 'estimate.viewed',
        title: 'E2E test: should NOT show',
        body: 'Triggered by playwright after opt-out',
        linkUrl: '/dashboard',
      },
    })
    expect(dispatch2.ok()).toBe(true)
    // Give realtime 3s — if it were going to arrive, it would have by now
    await page.waitForTimeout(3000)
    await expect(badge).toBeHidden()
  })
})
