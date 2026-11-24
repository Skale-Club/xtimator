import { CUSTOM_DOMAIN_ENABLED } from '../../lib/billing/plan-bullets'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

test('[QA:DISABLED-SURFACES] launch-disabled domain settings and the retired tenant inbox fail closed', async ({ context, baseURL }) => {
  expect(CUSTOM_DOMAIN_ENABLED).toBe(false)
  const tenant = createQaFixture(baseURL!)
  try {
    await tenant.seed()
    await context.addCookies(tenant.cookies())
    for (const path of ['/settings/custom-domain', '/whatsapp']) {
      await test.step(`Reject ${path}`, async () => {
        const page = await context.newPage()
        try {
          const response = await page.goto(path)
          // Streaming may send200 before the nested notFound boundary resolves.
          expect([200, 404]).toContain(response?.status())
          await expect(page).toHaveURL(new URL(path, baseURL).href)
          await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible()
          await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
          await expect(page.getByRole('heading', { name: 'Custom Domain', exact: true })).toHaveCount(0)
          await expect(page.getByRole('textbox')).toHaveCount(0)
        } finally {
          await page.close()
        }
      })
    }
  } finally {
    await tenant.cleanup()
  }
})
