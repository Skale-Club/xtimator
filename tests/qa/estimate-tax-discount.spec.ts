import { execFileSync } from 'node:child_process'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { typeSignature } from './fixtures/keyboard-signature'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

// The 13.33% discount rounds to $137.74 on $1,033.33. The taxable
// $1,000 share bears $133.30, so 7.25% on $866.70 rounds to $62.84.
const amounts = {
  subtotal: 1033.33, discount_amount: 137.74, tax_amount: 62.84, total: 958.43,
}
const displayedAmounts = [
  { label: 'Subtotal', amount: '$1,033.33' },
  { label: 'Discount', amount: '-$137.74' },
  { label: 'Tax', amount: '$62.84' },
  { label: 'Total', amount: '$958.43' },
] as const

function totalsBlock(page: Page) {
  return page.locator('[data-page-block-id="totals"]').filter({ visible: true })
}

async function expectRenderedTotals(block: Locator, editable: boolean) {
  for (const { label, amount } of displayedAmounts) {
    const renderedLabel = editable ? label
      : label === 'Discount' ? 'Discount (13.33%)'
      : label === 'Tax' ? 'Tax (7.25%)'
      : label
    const row = block.getByText(renderedLabel, { exact: true }).locator('..')
    await expect(row.getByText(amount, { exact: true })).toBeVisible()
  }
}

async function checkPdf(page: Page, info: TestInfo, path: string, name: string, descriptions: string[]) {
  const response = await page.request.get(path, { maxRedirects: 0, timeout: 30_000 })
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')
  const pdf = await response.body()
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  const text = execFileSync(process.env.QA_PYTHON || 'python', ['-c',
    'import io,sys;from pypdf import PdfReader;print(" ".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages))',
  ], { input: pdf, encoding: 'utf8', timeout: 15_000 }).replace(/\s+/g, ' ')
  for (const description of descriptions) expect(text).toContain(description)
  expect(text).toMatch(/\bSubtotal\s+\$1,033\.33\s+Discount \(13\.33%\)\s+-\$137\.74\s+Tax \(7\.25%\)\s+\$62\.84\s+Total\s+\$958\.43\b/)
  await info.attach(name, { body: pdf, contentType: 'application/pdf' })
}

test('[QA:ESTIMATE-TAX-DISCOUNT] prorates the discount over taxable items and shows identical rounded totals', async ({ context, page, baseURL }, info) => {
  test.setTimeout(240_000)
  const fixture = createQaFixture(baseURL!, { taxExemptLine: true })
  const desktop = info.project.name === 'chromium'
  const projectPath = `/projects/${fixture.projectId}`
  const pdfPath = `/api/estimates/${fixture.estimateId}/pdf`
  try {
    await fixture.seed()
    await context.addCookies(fixture.cookies())
    expect((await page.goto(projectPath))?.status()).toBe(200)
    expect(await fixture.readEstimate()).toMatchObject({
      subtotal: amounts.subtotal, tax_amount: 0, discount_amount: 0, total: amounts.subtotal,
    })
    const totals = totalsBlock(page)
    const rate = totals.getByRole('textbox', { name: 'Tax', exact: true })
    await rate.fill('7.25')
    await rate.press('Tab')

    if (desktop) {
      const taxable = page.locator(`[data-item-id="${fixture.itemId}"]`).filter({ visible: true })
        .getByRole('switch', { name: 'Tax', exact: true })
      const exempt = page.locator(`[data-item-id="${fixture.exemptItemId}"]`).filter({ visible: true })
        .getByRole('switch', { name: 'Tax', exact: true })
      await expect(taxable).not.toBeChecked()
      await taxable.click()
      await expect(taxable).toBeChecked()
      await expect(exempt).not.toBeChecked()
    } else {
      const line = page.locator(`[data-mobile-item-id="${fixture.itemId}"]`).filter({ visible: true })
      await line.getByRole('button', { name: /^Edit item:/ }).click()
      const sheet = page.getByTestId('item-editor-sheet')
      // An exempt line opens More options by default.
      await expect(sheet.getByRole('button', { name: 'More options', exact: true }))
        .toHaveAttribute('aria-expanded', 'true')
      const taxable = sheet.getByRole('switch', { name: 'Charge tax', exact: true })
      await expect(taxable).not.toBeChecked()
      await taxable.click()
      await expect(taxable).toBeChecked()
      await sheet.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(sheet).toHaveCount(0)
    }
    await totals.getByRole('button', { name: 'Discount', exact: true }).click()
    const discount = totals.getByRole('textbox', { name: 'Discount', exact: true })
    await discount.fill('13.33')
    await discount.press('Tab')
    await expectRenderedTotals(totals, true)

    await expect.poll(() => fixture.readEstimate()).toMatchObject({
      ...amounts, tax_rate: 0.0725, discount_type: 'percentage', discount_value: 13.33,
    })
    const [taxable, exempt, section, project] = await Promise.all([
      fixture.readOwn('estimate_items', fixture.itemId),
      fixture.readOwn('estimate_items', fixture.exemptItemId),
      fixture.readOwn('estimate_sections', fixture.sectionId),
      fixture.readProject(),
    ])
    expect(taxable).toMatchObject({ section_id: fixture.sectionId, taxable: true, total: 1000 })
    expect(exempt).toMatchObject({ section_id: fixture.sectionId, taxable: false, total: 33.33 })
    expect(section).toMatchObject({ estimate_id: fixture.estimateId, subtotal: amounts.subtotal })
    expect(project).toMatchObject({ total: amounts.total })

    await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Not saved', { exact: true })).toHaveCount(0)
    expect((await page.reload())?.status()).toBe(200)
    await expect(rate).toHaveValue('7.25')
    await expect(discount).toHaveValue('13.33')
    await expectRenderedTotals(totals, true)
    if (desktop) {
      const pageView = page.getByRole('button', { name: 'Page view', exact: true })
      await pageView.click()
      await expect(pageView).toHaveAttribute('aria-pressed', 'true')
      await expectRenderedTotals(totals, false)
    }

    const descriptions = [fixture.lineDescription, fixture.exemptLineDescription]
    await checkPdf(page, info, pdfPath, 'owner-tax-discount.pdf', descriptions)
    await page.close()
    await context.clearCookies()
    const anonymous = await context.newPage()
    expect((await anonymous.goto(`/estimate/${fixture.shareToken}`))?.status()).toBe(200)
    for (const description of descriptions) {
      await expect(anonymous.getByText(description, { exact: true }).filter({ visible: true })).toBeVisible()
    }
    await expectRenderedTotals(totalsBlock(anonymous), false)

    // Public PDF download requires the actual frozen signed copy.
    const publicPdfPath = `${pdfPath}?token=${fixture.shareToken}`
    expect((await anonymous.request.get(publicPdfPath, { maxRedirects: 0 })).status()).toBe(404)
    const accept = desktop
      ? anonymous.getByTestId('proposal-bar').getByRole('button', { name: 'Accept', exact: true })
      : anonymous.getByTestId('mobile-accept-bar').getByRole('button', { name: 'Accept Estimate', exact: true })
    await accept.click()
    const dialog = anonymous.getByRole('dialog', { name: 'Sign to accept this estimate', exact: true })
    const signer = 'QA Tax Breakdown Signer'
    await typeSignature(anonymous, dialog, signer)
    const [signatureResponse] = await Promise.all([
      anonymous.waitForResponse(response => new URL(response.url()).pathname === `/api/estimates/${fixture.estimateId}/sign`
        && response.request().method() === 'POST', { timeout: 30_000 }),
      dialog.getByRole('button', { name: 'Sign & Accept Estimate', exact: true }).click(),
    ])
    expect(signatureResponse.status()).toBe(200)
    await expect(anonymous.getByTestId('response-status')).toContainText('Estimate Accepted')
    expect(await fixture.readSignature()).toMatchObject({
      signer_name: signer,
      signed_content: { ...amounts, tax_rate: 0.0725, discount_type: 'percentage', discount_value: 13.33 },
    })
    const download = anonymous.getByRole('link', { name: 'Download PDF', exact: true })
    await expect(download).toHaveAttribute('href', publicPdfPath)
    await checkPdf(anonymous, info, publicPdfPath, 'public-tax-discount.pdf', [...descriptions, signer])
  } finally {
    const closes = await Promise.allSettled(context.pages().map(openPage => openPage.close()))
    await fixture.cleanup()
    for (const close of closes) if (close.status === 'rejected') throw close.reason
  }
})
