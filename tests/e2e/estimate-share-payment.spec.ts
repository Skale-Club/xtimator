/**
 * Public estimate and change order links: what the client can do, driven by the
 * two per-company switches and by the invoices already issued
 * (XTM-D-20261121-feature-switches).
 *
 *   - Online approval (Accept / Decline) exists only when the platform switch
 *     (digital_signature_allowed) AND the company switch (digital_signature_enabled)
 *     are both on. When either is off the link is view-only and the client cannot
 *     tell which one it was.
 *   - Payments work through Stripe hosted invoices: an "Invoices" card lists each
 *     open invoice as a pay link (hosted_invoice_url, new tab) and each paid one
 *     with its paid / refunded state. Draft and void invoices are never shown.
 *     Switching online payments off never hides an invoice that was already sent.
 *
 * Nothing here clicks through to Stripe: the invoice rows carry a placeholder URL.
 *
 * Env requirements (the suite skips cleanly when missing):
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DB seeding)
 *   Migrations 20261121140000 / 20261121150000 / 20261121160000 applied on that DB
 *   Dev server reachable at the Playwright baseURL (auto-started via config)
 *
 * Run (desktop project; the spec sets its own two viewports):
 *   npx playwright test tests/e2e/estimate-share-payment.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test'
import {
  seedConnectEstimates,
  cleanupConnectEstimates,
  hasSeederCredentials,
  probeFeatureSwitchColumns,
  PLACEHOLDER_INVOICE_URL,
  type SeededPaths,
} from './fixtures/connect-estimates'

const VIEWPORTS = [
  { name: '375 wide', width: 375, height: 812 },
  { name: '1366 wide', width: 1366, height: 768 },
] as const

let paths: SeededPaths | null = null

// Public pages: always visit anonymously (no owner session, so no owner-preview band).
test.use({ storageState: { cookies: [], origins: [] } })

const acceptButton = (page: Page) => page.getByRole('button', { name: 'Accept', exact: true })
const declineButton = (page: Page) => page.getByRole('button', { name: 'Decline estimate' })
const invoicesHeading = (page: Page) => page.getByRole('heading', { name: 'Invoices' })
const estimatePayLinks = (page: Page) => page.getByRole('link', { name: /^Pay deposit/ })
const payLinkAmount = /Pay deposit.*\$100\.00/

/** Visits the seeded page and waits until the document itself has rendered. */
async function open(page: Page, key: keyof SeededPaths) {
  await page.goto(paths![key])
  await expect(page.getByTestId('proposal-bar').or(page.getByTestId('change-order-lines'))).toBeVisible()
}

async function expectViewOnly(page: Page) {
  await expect(acceptButton(page)).toHaveCount(0)
  await expect(page.getByTestId('mobile-accept-bar')).toHaveCount(0)
  await expect(declineButton(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Decline/ })).toHaveCount(0)
  await expect(invoicesHeading(page)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^Pay\b/ })).toHaveCount(0)
}

test.describe('public estimate and change order links: switches and invoices', () => {
  test.beforeAll(async () => {
    test.skip(
      !hasSeederCredentials(),
      'Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run share-payment e2e'
    )
    const probe = await probeFeatureSwitchColumns()
    test.skip(
      !probe.ok,
      probe.ok
        ? ''
        : `Feature switch columns unavailable: ${probe.message}. Apply migrations 20261121140000, 20261121150000 and 20261121160000 to this database.`
    )
    paths = await seedConnectEstimates()
  })

  test.afterAll(async () => {
    if (hasSeederCredentials() && paths) {
      await cleanupConnectEstimates()
    }
  })

  for (const vp of VIEWPORTS) {
    test.describe(`at ${vp.name}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } })

      // ---- Estimate: the four link states -------------------------------------

      test('view only (company switch off): document renders, nothing to click', async ({ page }) => {
        await open(page, 'viewOnly')
        await expectViewOnly(page)
      })

      test('platform switch off: identical to view only', async ({ page }) => {
        await open(page, 'platformOff')
        await expectViewOnly(page)
      })

      test('sign only: Accept and Decline are offered, no Invoices card', async ({ page }) => {
        await open(page, 'signOnly')
        await expect(acceptButton(page)).toBeVisible()
        await expect(invoicesHeading(page)).toHaveCount(0)
        await expect(page.getByRole('link', { name: /^Pay\b/ })).toHaveCount(0)

        // Decline lives inside the signature panel that Accept opens.
        await acceptButton(page).click()
        await expect(declineButton(page)).toBeVisible()
      })

      test('pay only: pay link to the hosted invoice in a new tab, no Accept or Decline', async ({ page }) => {
        await open(page, 'payOnly')
        await expect(invoicesHeading(page)).toBeVisible()

        const link = page.getByRole('link', { name: payLinkAmount })
        await expect(link).toHaveCount(1)
        await expect(link).toBeVisible()
        await expect(link).toHaveAttribute('href', PLACEHOLDER_INVOICE_URL)
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link).toHaveAttribute('rel', /noopener/)

        await expect(acceptButton(page)).toHaveCount(0)
        await expect(page.getByTestId('mobile-accept-bar')).toHaveCount(0)
        await expect(page.getByRole('button', { name: /Decline/ })).toHaveCount(0)
      })

      test('sign and pay: both the pay link and Accept are offered', async ({ page }) => {
        await open(page, 'signAndPay')
        await expect(acceptButton(page)).toBeVisible()
        await expect(invoicesHeading(page)).toBeVisible()
        const link = page.getByRole('link', { name: payLinkAmount })
        await expect(link).toBeVisible()
        await expect(link).toHaveAttribute('href', PLACEHOLDER_INVOICE_URL)

        await acceptButton(page).click()
        await expect(declineButton(page)).toBeVisible()
      })

      // ---- Estimate: invoice states -------------------------------------------

      test('paid invoice: shows the paid state and no pay link', async ({ page }) => {
        await open(page, 'paid')
        await expect(invoicesHeading(page)).toBeVisible()
        await expect(page.getByText(/Paid: deposit.*\$100\.00/)).toBeVisible()
        await expect(page.getByRole('link', { name: /^Pay\b/ })).toHaveCount(0)
        await expect(page.getByTestId('invoice-refund-label')).toHaveCount(0)
      })

      test('fully refunded invoice: shows "Refunded"', async ({ page }) => {
        await open(page, 'refundedFull')
        await expect(page.getByText(/Paid: deposit.*\$100\.00/)).toBeVisible()
        await expect(page.getByTestId('invoice-refund-label')).toHaveText('Refunded')
        await expect(page.getByRole('link', { name: /^Pay\b/ })).toHaveCount(0)
      })

      test('partly refunded invoice: shows "Partly refunded" with the amount', async ({ page }) => {
        await open(page, 'refundedPartial')
        await expect(page.getByText(/Paid: deposit.*\$100\.00/)).toBeVisible()
        await expect(page.getByTestId('invoice-refund-label')).toHaveText('Partly refunded: $40.00')
        await expect(page.getByRole('link', { name: /^Pay\b/ })).toHaveCount(0)
      })

      test('payments switched off after the invoice was issued: pay link is still shown', async ({ page }) => {
        await open(page, 'paymentsOffIssued')
        await expect(invoicesHeading(page)).toBeVisible()
        const link = page.getByRole('link', { name: payLinkAmount })
        await expect(link).toBeVisible()
        await expect(link).toHaveAttribute('href', PLACEHOLDER_INVOICE_URL)
      })

      test('draft and void invoices alone: no Invoices card', async ({ page }) => {
        await open(page, 'hiddenOnly')
        await expect(invoicesHeading(page)).toHaveCount(0)
        await expect(page.getByRole('link', { name: /^Pay\b/ })).toHaveCount(0)
        await expect(page.getByText('$111.11')).toHaveCount(0)
        await expect(page.getByText('$222.22')).toHaveCount(0)
      })

      test('draft and void invoices next to an open one: only the open one is listed', async ({ page }) => {
        await open(page, 'hiddenMixed')
        await expect(invoicesHeading(page)).toBeVisible()
        await expect(estimatePayLinks(page)).toHaveCount(1)
        await expect(page.getByRole('link', { name: payLinkAmount })).toBeVisible()
        await expect(page.getByText('$111.11')).toHaveCount(0)
        await expect(page.getByText('$222.22')).toHaveCount(0)
      })

      // ---- Change order page --------------------------------------------------

      test('change order, open invoice: pay link in a new tab, view only', async ({ page }) => {
        await open(page, 'coOpen')
        const card = page.getByTestId('change-order-pay-invoice')
        await expect(card).toBeVisible()
        const link = card.getByRole('link', { name: 'Pay invoice' })
        await expect(link).toHaveAttribute('href', PLACEHOLDER_INVOICE_URL)
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link).toHaveAttribute('rel', /noopener/)
        await expect(page.getByTestId('change-order-invoice-paid')).toHaveCount(0)

        await expect(page.getByTestId('change-order-actions')).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Approve and sign' })).toHaveCount(0)
        await expect(page.getByTestId('contact-to-approve')).toBeVisible()
      })

      test('change order, payments switched off after issuing: pay link still shown', async ({ page }) => {
        await open(page, 'coPaymentsOffIssued')
        await expect(
          page.getByTestId('change-order-pay-invoice').getByRole('link', { name: 'Pay invoice' })
        ).toHaveAttribute('href', PLACEHOLDER_INVOICE_URL)
      })

      test('change order, paid invoice: paid state and no pay link', async ({ page }) => {
        await open(page, 'coPaid')
        const paid = page.getByTestId('change-order-invoice-paid')
        await expect(paid).toBeVisible()
        await expect(paid).toContainText('Paid: $100.00')
        await expect(page.getByTestId('change-order-pay-invoice')).toHaveCount(0)
        await expect(page.getByRole('link', { name: 'Pay invoice' })).toHaveCount(0)
        await expect(page.getByTestId('invoice-refund-label')).toHaveCount(0)
      })

      test('change order, refunded invoice: "Refunded" and "Partly refunded"', async ({ page }) => {
        await open(page, 'coRefundedFull')
        await expect(page.getByTestId('invoice-refund-label')).toHaveText('Refunded')

        await open(page, 'coRefundedPartial')
        await expect(page.getByTestId('invoice-refund-label')).toHaveText('Partly refunded: $40.00')
      })

      test('change order, sign only: approve and decline offered, no invoice card', async ({ page }) => {
        await open(page, 'coSignOnly')
        await expect(page.getByTestId('change-order-actions')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Approve and sign' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Decline', exact: true })).toBeVisible()
        await expect(page.getByTestId('change-order-pay-invoice')).toHaveCount(0)
        await expect(page.getByTestId('change-order-invoice-paid')).toHaveCount(0)
        await expect(page.getByTestId('contact-to-approve')).toHaveCount(0)
      })
    })
  }
})
