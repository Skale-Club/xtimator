import type { Locator } from '@playwright/test'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

const ID = /^[a-f0-9-]{36}$/
const VALIDITY_DAYS = 17
const TAX_PERCENT = '6.75'
const TAX_RATE = 0.0675
const PAYMENT_TEXT = 'Synthetic QA terms: balance due when the walkthrough is complete.'

function dueDate(createdAt: string) {
  // Compare calendar days in the app's business timezone, independent of
  // the runner timezone and the server's date-calculation implementation.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date(createdAt))
  const [year, month, day] = ['year', 'month', 'day'].map(kind => Number(parts.find(part => part.type === kind)?.value))
  return new Date(Date.UTC(year, month - 1, day + VALIDITY_DAYS)).toISOString().slice(0, 10)
}

async function turnOn(control: Locator) {
  if (!(await control.isChecked())) await control.click()
  await expect(control).toBeChecked()
}

test('[QA:ESTIMATE-DEFAULTS-APPLY] changed workspace defaults apply to a new manual estimate and leave the old estimate unchanged', async ({ page, context, baseURL }, info) => {
  test.setTimeout(240_000)
  const fixture = createQaFixture(baseURL!)
  try {
    await fixture.seed()
    await context.addCookies(fixture.cookies())
    const original = await fixture.readEstimate()
    expect(original).toMatchObject({ id: fixture.estimateId, version: 1, total: fixture.total })

    expect((await page.goto('/settings/estimates'))?.status()).toBe(200)
    const tax = page.locator('input[name="defaultTaxRate"]')
    const validity = page.locator('input[name="defaultValidityDays"]')
    const payment = page.getByRole('switch', { name: /^Payment terms\b/ })
    const validUntil = page.getByRole('switch', { name: /^Valid until\b/ })
    const terms = page.getByRole('textbox', { name: 'Payment terms', exact: true })
    await turnOn(payment)
    await turnOn(validUntil)
    await tax.fill(TAX_PERCENT)
    await validity.fill(String(VALIDITY_DAYS))
    await terms.fill(PAYMENT_TEXT)
    await expect(tax).toHaveValue(TAX_PERCENT)
    await expect(validity).toHaveValue(String(VALIDITY_DAYS))
    await expect(terms).toHaveValue(PAYMENT_TEXT)
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByText('Estimate settings saved.', { exact: true })).toBeVisible()
    expect(await fixture.readCompany()).toMatchObject({
      id: fixture.companyId,
      default_tax_rate: TAX_RATE,
      default_validity_days: VALIDITY_DAYS,
      default_payment_terms: PAYMENT_TEXT,
      document_blocks: { payment_terms: true, valid_until: true },
    })

    expect((await page.reload())?.status()).toBe(200)
    await expect(tax).toHaveValue(TAX_PERCENT)
    await expect(validity).toHaveValue(String(VALIDITY_DAYS))
    await expect(terms).toHaveValue(PAYMENT_TEXT)
    await expect(payment).toBeChecked()
    await expect(validUntil).toBeChecked()

    expect((await page.goto('/projects/new'))?.status()).toBe(200)
    await expect(page).toHaveURL(url => url.pathname === '/projects' && url.searchParams.get('modal') === 'new-project')
    const wizard = page.getByRole('dialog', { name: 'New Xtimate', exact: true })
    await wizard.getByTestId('start-from-scratch-btn').click()
    await expect(page).toHaveURL(url => url.pathname.startsWith('/projects/')
      && ID.test(url.pathname.slice('/projects/'.length)) && ID.test(url.searchParams.get('estimate') ?? ''))
    const location = new URL(page.url())
    const projectId = location.pathname.slice('/projects/'.length)
    const estimateId = location.searchParams.get('estimate')!
    expect(projectId).not.toBe(fixture.projectId)
    expect(estimateId).not.toBe(fixture.estimateId)
    const draft = await fixture.readEstimate(estimateId)
    expect(draft).toMatchObject({
      id: estimateId, project_id: projectId, company_id: fixture.companyId,
      is_current: true, status: 'draft', tax_rate: TAX_RATE, payment_terms: PAYMENT_TEXT,
      created_at: expect.any(String), presentation_settings: { sections: { payment_terms: true, valid_until: true } },
    })
    expect(draft!.valid_until).toBe(dueDate(draft!.created_at))
    expect(await fixture.readEstimate()).toEqual(original)

    const taxField = page.locator('[data-page-block-id="totals"]').filter({ visible: true })
      .getByRole('textbox', { name: 'Tax', exact: true })
    const paymentBlock = page.locator('[data-page-block-id="terms-payment"]').filter({ visible: true })
    await expect(taxField).toHaveValue(TAX_PERCENT)
    await expect(paymentBlock.getByRole('textbox', { name: 'Payment Terms', exact: true })).toHaveValue(PAYMENT_TEXT)
    if (info.project.name !== 'chromium') {
      await page.getByRole('button', { name: 'Show estimate details', exact: true }).click()
    }
    await expect(page.getByText(/^Valid until:/i).filter({ visible: true })).toBeVisible()
  } finally {
    try {
      await page.close()
    } finally {
      await fixture.cleanup()
    }
  }
})
