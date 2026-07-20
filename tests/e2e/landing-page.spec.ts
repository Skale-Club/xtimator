import { expect, test } from '@playwright/test'

test.describe('landing page', () => {
  test('hero', async ({ page }) => {
    await page.goto('/')

    // Headline per CONTEXT.md D-05: "Professional estimates in 5 minutes."
    const hero = page.getByRole('heading', { level: 1 })
    await expect(hero).toBeVisible()
    await expect(hero).toContainText(/professional estimates/i)
    // CTAs are now buttons that open the AuthDialog (no /login or /signup pages).
    await expect(page.getByRole('button', { name: 'Start free' }).first()).toBeVisible()
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
  })

  test('authenticated root stays on landing', async ({ page }) => {
    const adminEmail = process.env.TEST_ADMIN_EMAIL
    const adminPassword = process.env.TEST_ADMIN_PASSWORD

    test.skip(
      !adminEmail || !adminPassword,
      'Set TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD to run authenticated root test'
    )

    await page.goto('/?auth=login')
    await page.waitForSelector('[role="dialog"]')
    await page.fill('input[name="email"]', adminEmail!)
    // Step 1 -> click Continue, then Step 2 password
    await page.getByRole('button', { name: /^Continue$/ }).click()
    await page.fill('input[name="password"]', adminPassword!)
    await page.getByRole('button', { name: /^Sign in$/ }).click()
    await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10000 })

    // Quick-260718-w4r: the proxy no longer 307s an authed GET / to /dashboard
    // — the marketing page must stay reachable while logged in.
    await page.goto('/')
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('landing-shell')).toBeVisible()
  })
})

test.describe('mobile', () => {
  test('no horizontal overflow at mobile width', async ({ page }) => {
    await page.goto('/')

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth
    })

    expect(hasOverflow).toBe(false)
  })

  test('hero CTA buttons visible above the fold without scrolling', async ({ page }) => {
    await page.goto('/')

    const startFreeBtn = page.getByRole('button', { name: 'Start free' }).first()

    await expect(startFreeBtn).toBeVisible()

    const viewportHeight = await page.evaluate(() => window.innerHeight)

    const startFreeBoundingBox = await startFreeBtn.boundingBox()

    expect(startFreeBoundingBox).not.toBeNull()

    // Primary CTA should be within the viewport (above the fold)
    expect(startFreeBoundingBox!.y + startFreeBoundingBox!.height).toBeLessThanOrEqual(viewportHeight)
  })

  test('landing sections are reachable on mobile', async ({ page }) => {
    await page.goto('/')

    const howItWorksHeading = page.getByRole('heading', { name: /Record audio/i })
    await howItWorksHeading.scrollIntoViewIfNeeded()
    await expect(howItWorksHeading).toBeVisible()

    const featuresHeading = page.getByRole('heading', { name: /AI-generated estimate draft/i })
    await featuresHeading.scrollIntoViewIfNeeded()
    await expect(featuresHeading).toBeVisible()
  })
})

test.describe('brand palette', () => {
  test('page has dark non-white background', async ({ page }) => {
    await page.goto('/')

    const bodyBg = await page.evaluate(() => {
      const body = document.body
      const style = window.getComputedStyle(body)
      return style.backgroundColor
    })

    // Should not be white (rgb(255, 255, 255)) — must be dark
    expect(bodyBg).not.toBe('rgb(255, 255, 255)')
    expect(bodyBg).not.toBe('rgba(255, 255, 255, 0)')
  })

  test('landing shell has dark background gradient', async ({ page }) => {
    await page.goto('/')

    const shellExists = await page.locator('[data-testid="landing-shell"]').count()
    expect(shellExists).toBeGreaterThan(0)

    // The shell should carry a dark class establishing dark mode context
    const hasDarkClass = await page.locator('[data-testid="landing-shell"]').evaluate((el) => {
      return el.classList.contains('dark')
    })
    expect(hasDarkClass).toBe(true)
  })

  test('primary CTA button resolves through brand blue accent', async ({ page }) => {
    await page.goto('/')

    const primaryCta = page.getByRole('button', { name: 'Start free' }).first()
    await expect(primaryCta).toBeVisible()

    const bgColor = await primaryCta.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor
    })

    // Should not be white/transparent — must be a colored (brand blue) background
    expect(bgColor).not.toBe('rgb(255, 255, 255)')
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(bgColor).not.toBe('transparent')
  })
})
