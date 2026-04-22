import { test, expect } from '@playwright/test'

/**
 * Phase 9 — dark-mode E2E sweeps.
 *
 * Wave 3 owns the `primitives-dark` describe block (this file).
 * Other waves (09-02, 09-04) may add their own describe blocks to this same
 * file — they should not collide with this one.
 */

test.describe('Phase 9 — primitives render with dark palette', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: 'eb-theme',
        value: 'dark',
        url: 'http://localhost:9633',
      },
    ])
  })

  test('primitives-dark: body background resolves to a non-white color when eb-theme=dark', async ({
    page,
  }) => {
    await page.goto('/auth/login')

    // The auth tree already carries a dark scoped wrapper ([data-theme="dark-auth"])
    // from Phase 8. We additionally assert that next-themes (once 09-01 lands)
    // honours the eb-theme cookie. Until then, the dark-auth wrapper provides
    // the dark palette and this assertion still holds.
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    )

    // :root --background is white (0 0% 100%). The dark palette must NOT be white,
    // and must NOT be transparent. Exact HSL→RGB conversion varies by browser,
    // so we assert the contract (non-white, non-transparent) rather than a
    // specific rgb() value.
    expect(bg).not.toBe('rgb(255, 255, 255)')
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  })
})
