import { execFileSync } from 'node:child_process'
import type { Page } from '@playwright/test'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

type Tenant = ReturnType<typeof createQaFixture>

const UPDATED_TOTAL = 376.5
const UPDATED_AMOUNT = '$376.50'

async function withTenant(page: Page, baseURL: string, work: (fixture: Tenant) => Promise<void>) {
  const fixture = createQaFixture(baseURL)
  try {
    await fixture.seed()
    await work(fixture)
  } finally {
    try {
      await page.close()
    } finally {
      await fixture.cleanup()
    }
  }
}

function documentTotal(page: Page, amount: string) {
  return page.locator('[data-page-block-id="totals"]').filter({ visible: true })
    .getByText('Total', { exact: true }).locator('..').getByText(amount, { exact: true })
}

async function signEstimate(page: Page, fixture: Tenant, desktop: boolean) {
  expect((await page.goto(`/estimate/${fixture.shareToken}`))?.status()).toBe(200)
  const accept = desktop
    ? page.getByTestId('proposal-bar').getByRole('button', { name: 'Accept', exact: true })
    : page.getByTestId('mobile-accept-bar').getByRole('button', { name: 'Accept Estimate', exact: true })
  await accept.click()
  const dialog = page.getByRole('dialog', { name: 'Sign to accept this estimate', exact: true })
  const signer = 'QA Estimate Lock Signer'
  await dialog.getByLabel('Your full name').fill(signer)
  const canvas = dialog.locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Signature canvas is not visible')
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.6)
  await page.mouse.down()
  for (const [x, y] of [[0.25, 0.3], [0.4, 0.7], [0.6, 0.25], [0.8, 0.6]]) {
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 3 })
  }
  await page.mouse.up()
  const [response] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname === `/api/estimates/${fixture.estimateId}/sign` && r.request().method() === 'POST', { timeout: 30_000 }),
    dialog.getByRole('button', { name: 'Sign & Accept Estimate', exact: true }).click(),
  ])
  expect(response.status()).toBe(200)
  await expect(page.getByTestId('response-status')).toContainText('Estimate Accepted')
  await expect.poll(async () => (await fixture.readSignature())?.signer_name).toBe(signer)
}

test('[QA:ESTIMATE-TOTALS] quantity and price edits persist the same total across the editor, owner PDF and public estimate', async ({ page, baseURL }, info) => {
  test.setTimeout(240_000)
  const desktop = info.project.name === 'chromium'
  await withTenant(page, baseURL!, async fixture => {
    await page.context().addCookies(fixture.cookies())
    expect((await page.goto(`/projects/${fixture.projectId}`))?.status()).toBe(200)
    expect(await fixture.readEstimate()).toMatchObject({ subtotal: 1000, total: 1000, tax_amount: 0, discount_amount: 0 })

    const desktopRow = page.locator(`[data-item-id="${fixture.itemId}"]`).filter({ visible: true })
    const mobileRow = page.locator(`[data-mobile-item-id="${fixture.itemId}"]`).filter({ visible: true })
    const sheet = page.getByTestId('item-editor-sheet')
    if (!desktop) await mobileRow.getByRole('button', { name: /^Edit item:/ }).filter({ hasText: fixture.lineDescription }).click()
    const quantity = desktop
      ? desktopRow.getByRole('spinbutton', { name: 'Qty', exact: true })
      : sheet.getByRole('spinbutton', { name: 'Quantity', exact: true })
    const price = desktop ? desktopRow.locator('input[data-money-input]') : sheet.locator('input[name="unit_price"]')
    await expect(quantity).toHaveValue('2')
    await quantity.fill('3')
    await expect(quantity).toHaveValue('3')
    await price.fill('125.50')
    await expect(price).toHaveValue('125.50')
    await price.press('Tab')
    if (!desktop) {
      await expect(sheet.getByTestId('item-editor-total')).toHaveText(UPDATED_AMOUNT)
      await sheet.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(sheet).toHaveCount(0)
    }

    await expect.poll(async () => (await fixture.readProject())?.total, { timeout: 20_000 }).toBe(UPDATED_TOTAL)
    const [item, section, estimate, project] = await Promise.all([
      fixture.readOwn('estimate_items', fixture.itemId),
      fixture.readOwn('estimate_sections', fixture.sectionId),
      fixture.readEstimate(),
      fixture.readProject(),
    ])
    expect(item).toMatchObject({
      id: fixture.itemId, company_id: fixture.companyId, section_id: fixture.sectionId,
      description: fixture.lineDescription, quantity: 3, unit_price: 125.5, total: UPDATED_TOTAL,
    })
    expect(section).toMatchObject({ id: fixture.sectionId, estimate_id: fixture.estimateId, subtotal: UPDATED_TOTAL })
    expect(estimate).toMatchObject({
      id: fixture.estimateId, project_id: fixture.projectId, subtotal: UPDATED_TOTAL, total: UPDATED_TOTAL,
      tax_amount: 0, discount_amount: 0,
    })
    expect(project).toMatchObject({ id: fixture.projectId, total: UPDATED_TOTAL })

    expect((await page.reload())?.status()).toBe(200)
    await expect(documentTotal(page, UPDATED_AMOUNT)).toBeVisible()
    if (desktop) {
      await expect(quantity).toHaveValue('3')
      await expect(price).toHaveValue('125.50')
      await expect(desktopRow.getByText(UPDATED_AMOUNT, { exact: true })).toBeVisible()
      const pageView = page.getByRole('button', { name: 'Page view', exact: true })
      await pageView.click()
      await expect(pageView).toHaveAttribute('aria-pressed', 'true')
      const paginatedRow = desktopRow.and(page.locator('[data-page-block-id]'))
      await expect(paginatedRow.getByText(UPDATED_AMOUNT, { exact: true })).toBeVisible()
      await expect(documentTotal(page, UPDATED_AMOUNT)).toBeVisible()
    } else {
      await expect(mobileRow.getByText(UPDATED_AMOUNT, { exact: true })).toBeVisible()
      await expect(mobileRow).toContainText(/3\s+[^×]*×\s*\$125\.50/)
    }

    const response = await page.request.get(`/api/estimates/${fixture.estimateId}/pdf`, { timeout: 30_000 })
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/pdf')
    const pdf = await response.body()
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const pdfText = execFileSync(process.env.QA_PYTHON || 'python', ['-c',
      'import io,sys;from pypdf import PdfReader;print(" ".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages))',
    ], { input: pdf, encoding: 'utf8', timeout: 15_000 }).replace(/\s+/g, ' ')
    for (const value of [fixture.companyName, fixture.sectionTitle, fixture.lineDescription, '125.50', '376.50']) {
      expect(pdfText).toContain(value)
    }
    await info.attach('updated-owner-estimate.pdf', { body: pdf, contentType: 'application/pdf' })

    await page.goto('about:blank')
    await page.context().clearCookies()
    expect((await page.goto(`/estimate/${fixture.shareToken}`))?.status()).toBe(200)
    await expect(page.getByText(fixture.sectionTitle, { exact: true }).filter({ visible: true })).toBeVisible()
    const publicLine = page.locator(`[data-track-section="item:${fixture.itemId}"]`).filter({ visible: true })
    await expect(publicLine.getByText(fixture.lineDescription, { exact: true })).toBeVisible()
    await expect(publicLine.getByText(UPDATED_AMOUNT, { exact: true })).toBeVisible()
    if (desktop) {
      await expect(publicLine.getByRole('cell', { name: '3', exact: true })).toBeVisible()
      await expect(publicLine.getByRole('cell', { name: '$125.50', exact: true })).toBeVisible()
    } else {
      await expect(publicLine).toContainText(/3\s+[^×]*×\s*\$125\.50/)
    }
    await expect(documentTotal(page, UPDATED_AMOUNT)).toBeVisible()
  })
})

test('[QA:ESTIMATE-LOCK] a signed estimate exposes the change-order action and rejects line changes at the database', async ({ page, baseURL }, info) => {
  test.setTimeout(240_000)
  const desktop = info.project.name === 'chromium'
  await withTenant(page, baseURL!, async fixture => {
    await signEstimate(page, fixture, desktop)
    const signature = await fixture.readSignature()
    const item = await fixture.readOwn('estimate_items', fixture.itemId)
    const estimate = await fixture.readEstimate()
    expect(signature?.snapshot_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(signature?.signed_content)).toContain(fixture.lineDescription)
    expect(item).toMatchObject({ description: fixture.lineDescription, quantity: 2, unit_price: 500, total: fixture.total })
    expect(estimate).toMatchObject({ client_response: 'accepted', total: fixture.total })

    await page.goto('about:blank')
    await page.context().addCookies(fixture.cookies())
    expect((await page.goto(`/projects/${fixture.projectId}`))?.status()).toBe(200)
    const status = page.getByRole('button', { name: /^Estimate status: Accepted(?:\s|$)/ })
    await expect(status.getByTestId('estimate-status-lock')).toBeVisible()
    await expect(page.getByTestId('new-change-order-btn')).toBeEnabled()
    const line = page.locator(`[data-track-section="item:${fixture.itemId}"]`).filter({ visible: true })
    await expect(line.getByText(fixture.lineDescription, { exact: true })).toBeVisible()
    await expect(line.locator('input, textarea, button')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add item', exact: true })).toHaveCount(0)

    expect(await fixture.tryReviseOwnAcceptedLine()).toEqual({ errorCode: 'P0022', changedRows: 0 })
    expect(await fixture.readOwn('estimate_items', fixture.itemId)).toEqual(item)
    expect(await fixture.readSignature()).toEqual(signature)
    expect(await fixture.readEstimate()).toMatchObject({ client_response: 'accepted', total: fixture.total })
    expect(await fixture.readProject()).toMatchObject({ total: fixture.total })
  })
})
