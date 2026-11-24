import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { createSignatureFixture, hasSignatureTestCredentials } from './fixtures/signature-launch'

const SIGNER = 'Signature Smoke Signer'

test.skip(!hasSignatureTestCredentials(), 'Set SIGNATURE_E2E_DEV=1 and supply the isolated Supabase development credentials')

function signatureDate(timestamp: string) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

async function drawSignature(page: Page, dialog: Locator, mobile: boolean) {
  const canvas = dialog.locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  if (mobile) {
    // Playwright has no cross-browser touch-drag API. Exercise the page's
    // actual canvas with touch pointer events in the mobile browser profile.
    await canvas.evaluate((element) => {
      const { left, top, width, height } = element.getBoundingClientRect()
      const points = [[0.15, 0.62], [0.32, 0.27], [0.48, 0.7], [0.67, 0.34], [0.84, 0.58]]
      for (const [index, [x, y]] of points.entries()) {
        const type = index === 0 ? 'pointerdown' : index === points.length - 1 ? 'pointerup' : 'pointermove'
        element.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1,
          isPrimary: true, buttons: type === 'pointerup' ? 0 : 1,
          clientX: left + x * width, clientY: top + y * height,
        }))
      }
    })
  } else {
    const box = await canvas.boundingBox()
    if (!box) throw new Error('Signature canvas is not visible')
    await page.mouse.move(box.x + 0.15 * box.width, box.y + 0.62 * box.height)
    await page.mouse.down()
    for (const [x, y] of [[0.32, 0.27], [0.48, 0.7], [0.67, 0.34], [0.84, 0.58]]) {
      await page.mouse.move(box.x + x * box.width, box.y + y * box.height, { steps: 3 })
    }
    await page.mouse.up()
  }
  await expect(dialog.getByRole('button', { name: 'Clear' })).toBeVisible()
}

async function submitSignature(page: Page, submit: Locator, path: string) {
  const [response] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === path && response.request().method() === 'POST'),
    submit.click(),
  ])
  return response
}

function verifyPdf(pdf: Buffer) {
  expect(pdf.length).toBeGreaterThan(1000)
  expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
}

async function fetchPdf(page: Page, link: Locator) {
  const path = await link.getAttribute('href')
  if (!path) throw new Error('The PDF link has no target')
  const response = await page.request.get(path)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')
  const pdf = await response.body()
  verifyPdf(pdf)
  return pdf
}

async function attachSignedDocument(testInfo: TestInfo, name: string, page: Page, pdf: Buffer) {
  const pdfPath = testInfo.outputPath(`${name}.pdf`)
  const screenshotPath = testInfo.outputPath(`${name}.png`)
  await writeFile(pdfPath, pdf)
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' })
  await Promise.all([
    testInfo.attach(`${name}-pdf`, { path: pdfPath, contentType: 'application/pdf' }),
    testInfo.attach(`${name}-page`, { path: screenshotPath, contentType: 'image/png' }),
  ])
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const { clientWidth, scrollWidth } = document.documentElement
    return Math.max(scrollWidth, document.body.scrollWidth) - clientWidth
  })).toBeLessThanOrEqual(1)
}

interface PdfEvidence {
  text: string
  pageCount: number
  images: Array<{ width: number; height: number; sha256: string }>
}

function pdfEvidence(pdf: Buffer): PdfEvidence {
  const extract = [
    'import hashlib, io, json, sys',
    'try:',
    '    from pypdf import PdfReader',
    'except ImportError:',
    "    sys.exit('Signature PDF verification requires Python 3 with pypdf')",
    'document = PdfReader(io.BytesIO(sys.stdin.buffer.read()))',
    'images = []',
    'for page in document.pages:',
    "    resources = page['/Resources'].get_object()",
    "    xobjects = resources.get('/XObject')",
    '    if not xobjects:',
    '        continue',
    '    for reference in xobjects.get_object().values():',
    '        image = reference.get_object()',
    "        if image.get('/Subtype') != '/Image':",
    '            continue',
    "        images.append({'width': int(image['/Width']), 'height': int(image['/Height']), 'sha256': hashlib.sha256(image.get_data()).hexdigest()})",
    "text = ' '.join(' '.join(page.extract_text() for page in document.pages).split())",
    "print(json.dumps({'text': text, 'pageCount': len(document.pages), 'images': sorted(images, key=lambda image: image['sha256'])}))",
  ].join('\n')
  let output: string
  try {
    output = execFileSync(process.env.SIGNATURE_E2E_PYTHON ?? 'python', ['-c', extract], {
      input: pdf, encoding: 'utf8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (error) {
    const failure = error as { code?: string; stderr?: string }
    if (failure.code === 'ENOENT' || failure.stderr?.includes('requires Python 3 with pypdf')) {
      throw new Error('Signature PDF verification requires Python 3 with pypdf. Set SIGNATURE_E2E_PYTHON to its executable if needed.')
    }
    throw new Error('Could not read the rendered PDF evidence', { cause: error })
  }
  const evidence: PdfEvidence = JSON.parse(output)
  // Text extraction can insert a space at a kerned thousands separator.
  evidence.text = evidence.text.replace(/(\$\d{1,3},) (?=\d{3}\.)/g, '$1')
  expect(evidence.images).toContainEqual(expect.objectContaining({ width: 600, height: 160 }))
  return evidence
}

async function expectChangeOrderTotals(page: Page, current: string, next: string) {
  const totals = page.getByTestId('change-order-totals')
  await expect(totals.getByText('Current contract', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText(current)
  await expect(totals.getByText('New total', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText(next)
}

async function openChangeOrderSheet(page: Page) {
  await page.getByRole('button', { name: 'Approve and sign', exact: true }).click()
  return page.getByRole('dialog')
}

test('commits public signature evidence and preserves the signed documents', async ({ page, context }, testInfo) => {
  const fixture = createSignatureFixture()
  const mobile = testInfo.project.name !== 'chromium'
  const estimatePath = `/estimate/${fixture.token}`
  const estimateSignPath = `/api/estimates/${fixture.estimateId}/sign`
  const estimatePdf = page.getByRole('link', { name: 'Download PDF', exact: true })
  const dialog = page.getByRole('dialog')
  const estimateSubmit = dialog.getByRole('button', { name: 'Sign & Accept Estimate', exact: true })
  const estimateOpen = mobile
    ? page.getByTestId('mobile-accept-bar').getByRole('button', { name: 'Accept Estimate', exact: true })
    : page.getByTestId('proposal-bar').getByRole('button', { name: 'Accept', exact: true })

  try {
    const firstEstimatePdf = await test.step('Review the estimate, discard a drawing and sign the reviewed document', async () => {
      await fixture.seedEstimate()
      expect((await page.goto(estimatePath))?.status()).toBe(200)
      await expect(page.getByText(fixture.scope, { exact: true }).first()).toBeVisible()
      await expect(page.getByText(fixture.projectName, { exact: true }).first()).toBeVisible()
      await expect(estimatePdf).toHaveCount(0)
      if (mobile) await expectNoHorizontalOverflow(page)
      await estimateOpen.click()
      await dialog.getByLabel('Your full name').fill(SIGNER)
      if (mobile) await expectNoHorizontalOverflow(page)
      await drawSignature(page, dialog, mobile)
      await expect(estimateSubmit).toBeEnabled()
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(dialog).toBeHidden()
      await estimateOpen.click()
      await expect(dialog.getByText('Draw your signature above using your finger or mouse.')).toBeVisible()
      await expect(estimateSubmit).toBeDisabled()
      await dialog.getByLabel('Your full name').fill(SIGNER)
      await drawSignature(page, dialog, mobile)

      const signed = await submitSignature(page, estimateSubmit, estimateSignPath)
      expect(signed.status()).toBe(200)
      const result = await signed.json()
      const evidence = await fixture.signature('estimate', fixture.estimateId)
      expect(result.signature?.signerName).toBe(SIGNER)
      expect(result.signature?.signedAt).toBe(evidence.signed_at)
      expect(evidence.signer_name).toBe(SIGNER)
      expect(evidence.signature_data.startsWith('data:image/png;base64,')).toBe(true)
      expect(result.signature?.signatureDataUrl === evidence.signature_data).toBe(true)
      const signature = page.locator('[data-track-section="signature"]')
      await expect(signature.getByText(SIGNER, { exact: true })).toBeVisible()
      await expect(signature.getByText(signatureDate(evidence.signed_at), { exact: true })).toBeVisible()
      await expect(page.getByTestId('response-status')).toContainText('Estimate Accepted')
      if (mobile) await expectNoHorizontalOverflow(page)
      const pdf = await fetchPdf(page, estimatePdf)
      await attachSignedDocument(testInfo, 'signed-estimate', page, pdf)
      if (!mobile) {
        const [download] = await Promise.all([page.waitForEvent('download'), estimatePdf.click()])
        verifyPdf(await readFile(await download.path()))
      }
      const signedPdf = pdfEvidence(pdf)
      expect(signedPdf.pageCount).toBe(2)
      return signedPdf
    })

    if (mobile) return

    await test.step('Reload after editing live identity and keep the accepted estimate parties', async () => {
      await fixture.editParties()
      await page.reload()
      await expect(page.getByText(fixture.companyName, { exact: true }).first()).toBeVisible()
      await expect(page.getByText(fixture.clientName, { exact: true }).first()).toBeVisible()
      await expect(page.getByText(fixture.projectName, { exact: true }).first()).toBeVisible()
      for (const name of [fixture.editedCompanyName, fixture.editedClientName, fixture.editedProjectName]) {
        await expect(page.getByText(name, { exact: true })).toHaveCount(0)
      }
      const refreshedPdf = pdfEvidence(await fetchPdf(page, estimatePdf))
      for (const name of [fixture.companyName, fixture.clientName, fixture.projectName, SIGNER]) {
        expect(refreshedPdf.text).toContain(name)
      }
      expect(refreshedPdf).toEqual(firstEstimatePdf)
    })

    await test.step('Approve two change orders and reject the stale contract revision between them', async () => {
      const first = await fixture.seedOrder(1, 100)
      const second = await fixture.seedOrder(2, 200)
      const stale = await context.newPage()
      await stale.goto(second.path)
      await expectChangeOrderTotals(stale, '$1,000.00', '$1,200.00')
      await page.goto(first.path)
      await expectChangeOrderTotals(page, '$1,000.00', '$1,100.00')

      const firstSheet = await openChangeOrderSheet(page)
      await firstSheet.getByLabel('Your full name').fill(SIGNER)
      await drawSignature(page, firstSheet, false)
      const firstResult = await submitSignature(page, firstSheet.getByRole('button', { name: 'Sign & Approve' }), `/api/change-orders/${first.id}/sign`)
      expect(firstResult.status()).toBe(200)
      const firstEvidence = await fixture.signature('change_order', first.id)
      expect(firstEvidence.signed_content.contract).toMatchObject({ before: 1000, after: 1100 })
      await expect(page.getByTestId('approved-signature')).toContainText(SIGNER)
      await expect(page.getByTestId('response-status')).toContainText(signatureDate(firstEvidence.signed_at))
      const firstPdf = pdfEvidence(await fetchPdf(page, page.getByRole('link', { name: 'Download PDF' })))
      expect(firstPdf.text).toContain('Current contract $1,000.00')
      expect(firstPdf.text).toContain('New total $1,100.00')

      const staleSheet = await openChangeOrderSheet(stale)
      await staleSheet.getByLabel('Your full name').fill(SIGNER)
      await drawSignature(stale, staleSheet, false)
      const secondPath = `/api/change-orders/${second.id}/sign`
      const staleResult = await submitSignature(stale, staleSheet.getByRole('button', { name: 'Sign & Approve' }), secondPath)
      expect(staleResult.status()).toBe(409)
      expect(await staleResult.json()).toMatchObject({ error: 'change_order_updated' })
      const notice = stale.getByTestId('change-order-updated-notice')
      await expect(notice).toBeVisible()
      await expect(staleSheet).toBeHidden()
      await expect(stale.getByRole('button', { name: 'Approve and sign' })).toHaveCount(0)
      await Promise.all([
        stale.waitForEvent('load'),
        notice.getByRole('button', { name: 'Load latest version' }).click(),
      ])
      await expectChangeOrderTotals(stale, '$1,100.00', '$1,300.00')

      const secondSheet = await openChangeOrderSheet(stale)
      const secondSubmit = secondSheet.getByRole('button', { name: 'Sign & Approve' })
      await expect(secondSubmit).toBeDisabled()
      await secondSheet.getByLabel('Your full name').fill(SIGNER)
      await drawSignature(stale, secondSheet, false)
      const secondResult = await submitSignature(stale, secondSubmit, secondPath)
      expect(secondResult.status()).toBe(200)
      const secondEvidence = await fixture.signature('change_order', second.id)
      expect(secondEvidence.signed_content.contract).toMatchObject({ before: 1100, after: 1300 })
      await expect(stale.getByTestId('approved-signature')).toContainText(SIGNER)
      await expectChangeOrderTotals(stale, '$1,100.00', '$1,300.00')
      const secondPdfBytes = await fetchPdf(stale, stale.getByRole('link', { name: 'Download PDF' }))
      const secondPdf = pdfEvidence(secondPdfBytes)
      expect(secondPdf.text).toContain('Current contract $1,100.00')
      expect(secondPdf.text).toContain('New total $1,300.00')
      await attachSignedDocument(testInfo, 'signed-change-order-2', stale, secondPdfBytes)

      await page.reload()
      await expectChangeOrderTotals(page, '$1,000.00', '$1,100.00')
      await expect(page.getByTestId('approved-signature')).toContainText(SIGNER)
      const firstPdfAfterSecondApproval = await fetchPdf(page, page.getByRole('link', { name: 'Download PDF' }))
      expect(pdfEvidence(firstPdfAfterSecondApproval)).toEqual(firstPdf)
      await attachSignedDocument(testInfo, 'signed-change-order-1', page, firstPdfAfterSecondApproval)
    })
  } finally {
    await fixture.cleanup()
  }
})
