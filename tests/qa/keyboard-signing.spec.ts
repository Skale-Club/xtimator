import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { canonicalJsonStringify } from '../../lib/estimate/signed-snapshot'
import { createQaFixture } from './fixtures/tenant'
import { auditKeyboardSignature, expectNoSignaturePointer, expectSignaturePng, observeSignaturePointers, tabTo, typeSignature } from './fixtures/keyboard-signature'
import { expect, test } from './test'

test('[QA:SIGNATURE-KEYBOARD] an anonymous recipient signs the estimate and obtains its frozen PDF using only the keyboard', async ({ page, baseURL }, info) => {
  const fixture = createQaFixture(baseURL!)
  try {
    await fixture.seed()
    await observeSignaturePointers(page)
    expect((await page.goto(`/estimate/${fixture.shareToken}`))?.status()).toBe(200)
    const accept = info.project.name === 'chromium'
      ? page.getByTestId('proposal-bar').getByRole('button', { name: 'Accept', exact: true })
      : page.getByTestId('mobile-accept-bar').getByRole('button', { name: 'Accept Estimate', exact: true })
    await tabTo(page, accept)
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Sign to accept this estimate', exact: true })
    const sign = dialog.getByRole('button', { name: 'Sign & Accept Estimate', exact: true })
    await expect(sign).toBeDisabled()
    const signer = 'QA Keyboard Estimate Signer'
    await typeSignature(page, dialog, signer)
    await expect(sign).toBeEnabled()
    await auditKeyboardSignature(page, info, 'typed-estimate-signature')
    await tabTo(page, sign)
    const [response] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === `/api/estimates/${fixture.estimateId}/sign` && r.request().method() === 'POST'),
      page.keyboard.press('Enter'),
    ])
    expect(response.status()).toBe(200)
    await expect(page.getByTestId('response-status')).toContainText('Estimate Accepted')
    await expectNoSignaturePointer(page)
    const signature = await fixture.readSignature()
    expect(signature?.signer_name).toBe(signer)
    expectSignaturePng(signature!.signature_data)
    const digest = createHash('sha256').update(canonicalJsonStringify(signature!.signed_content)).digest('hex')
    expect(signature!.snapshot_sha256).toBe(digest)
    expect(JSON.stringify(signature!.signed_content)).toContain(fixture.lineDescription)
    expect((await fixture.readEstimate())?.client_response).toBe('accepted')
    const pdfLink = page.getByRole('link', { name: 'Download PDF', exact: true })
    const pdfResponse = await page.request.get((await pdfLink.getAttribute('href'))!)
    expect(pdfResponse.status()).toBe(200)
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf')
    const pdf = await pdfResponse.body()
    const parsed = JSON.parse(execFileSync(process.env.QA_PYTHON || 'python', ['-c',
      'import sys,json,io;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()));print(json.dumps({"text":" ".join(p.extract_text() or "" for p in r.pages),"images":sum(len(p.images) for p in r.pages)}))'],
      { input: pdf, encoding: 'utf8', timeout: 20_000 }))
    expect(parsed.text).toContain(signer)
    expect(parsed.text).toContain(fixture.lineDescription)
    expect(parsed.text).toContain('1,000.00')
    expect(parsed.images).toBeGreaterThan(0)
    await info.attach('keyboard-signed-estimate.pdf', { body: pdf, contentType: 'application/pdf' })
    expect((await page.reload())?.status()).toBe(200)
    await expect(page.getByTestId('response-status')).toContainText('Estimate Accepted')
    expect((await fixture.readSignature())?.snapshot_sha256).toBe(digest)
  } finally {
    try { await page.close() } finally { await fixture.cleanup() }
  }
})
