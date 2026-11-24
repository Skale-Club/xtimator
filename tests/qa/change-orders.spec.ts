import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { canonicalJsonStringify } from '../../lib/estimate/signed-snapshot'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

type Tenant = ReturnType<typeof createQaFixture>
type Line = { description: string; quantity: number; unitPrice: number }
type Order = { title: string; reason: string; lines: Line[]; total: number }

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
const CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

async function drawSignature(page: Page, dialog: Locator, signer: string) {
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
}

async function signOriginalEstimate(page: Page, fixture: Tenant, info: TestInfo) {
  expect((await page.goto(`/estimate/${fixture.shareToken}`))?.status()).toBe(200)
  const open = info.project.name === 'chromium'
    ? page.getByTestId('proposal-bar').getByRole('button', { name: 'Accept', exact: true })
    : page.getByTestId('mobile-accept-bar').getByRole('button', { name: 'Accept Estimate', exact: true })
  await open.click()
  const dialog = page.getByRole('dialog', { name: 'Sign to accept this estimate', exact: true })
  const signer = 'QA Original Estimate Signer'
  await drawSignature(page, dialog, signer)
  const [response] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname === `/api/estimates/${fixture.estimateId}/sign` && r.request().method() === 'POST', { timeout: 30_000 }),
    dialog.getByRole('button', { name: 'Sign & Accept Estimate', exact: true }).click(),
  ])
  expect(response.status()).toBe(200)
  await expect(page.getByTestId('response-status')).toContainText('Estimate Accepted')
  await expect.poll(async () => (await fixture.readSignature())?.signer_name).toBe(signer)
  expect((await fixture.readEstimate())?.client_response).toBe('accepted')
  const digest = (await fixture.readSignature())?.snapshot_sha256
  expect(digest).toMatch(/^[a-f0-9]{64}$/)
  return digest
}

async function createOrder(page: Page, fixture: Tenant, order: Order) {
  const ownerProject = `/projects/${fixture.projectId}`
  await page.context().addCookies(fixture.cookies())
  expect((await page.goto(ownerProject))?.status()).toBe(200)
  await page.getByTestId('new-change-order-btn').click()
  await expect(page).toHaveURL(new RegExp(`${ownerProject}/change-orders/[\\da-f-]+$`, 'i'))
  const ownerPath = new URL(page.url()).pathname
  const id = ownerPath.split('/').at(-1)!
  expect(id).toMatch(UUID)
  const editor = page.getByTestId('change-order-editor')
  await expect(editor.getByRole('heading', { name: 'Change order #1', exact: true })).toBeVisible()
  expect(await fixture.readOwnChangeOrder(id)).toMatchObject({
    company_id: fixture.companyId, estimate_id: fixture.estimateId,
    project_id: fixture.projectId, number: 1, status: 'draft',
  })
  await editor.getByRole('textbox', { name: 'Title', exact: true }).fill(order.title)
  await editor.getByRole('textbox', { name: 'Reason', exact: true }).fill(order.reason)

  for (const [index, line] of order.lines.entries()) {
    const credit = line.unitPrice < 0
    await editor.getByRole('button', { name: credit ? 'Add credit' : 'Add item', exact: true }).click()
    const row = editor.getByTestId('change-order-line').nth(index)
    const label = `Item ${index + 1}`
    await row.getByRole('textbox', { name: `${label} description`, exact: true }).fill(line.description)
    await row.getByRole('spinbutton', { name: `${label} quantity`, exact: true }).fill(String(line.quantity))
    await row.getByRole('spinbutton', { name: `${label} ${credit ? 'credit amount' : 'unit price'}`, exact: true })
      .fill(String(Math.abs(line.unitPrice)))
  }

  await expect.poll(async () => (await fixture.readOwnChangeOrder(id))?.total, { timeout: 20_000 }).toBe(order.total)
  const expectedItems = order.lines.map(line => ({
    description: line.description, quantity: line.quantity, unit_price: line.unitPrice, total: line.quantity * line.unitPrice,
  }))
  expect(await fixture.readOwnChangeOrderEvidence(id)).toMatchObject({
    order: { title: order.title, reason: order.reason, status: 'draft', total: order.total },
    items: expectedItems,
    signature: null,
  })
  expect((await page.reload())?.status()).toBe(200)
  await expect(editor.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(order.title)
  await expect(editor.getByTestId('change-order-top-bar-total')).toHaveText(`+${CURRENCY.format(order.total)}`)
  return { id, ownerPath }
}

async function shareOrder(page: Page, baseURL: string, fixture: Tenant, id: string) {
  await page.getByTestId('change-order-share').click()
  const dialog = page.getByRole('dialog', { name: 'Share change order', exact: true })
  const link = dialog.getByTestId('change-order-share-url')
  const token = (await fixture.readOwnChangeOrder(id))?.share_token
  expect(token).toMatch(UUID)
  const publicPath = `/change-order/${token}`
  const publicUrl = new URL(publicPath, baseURL).href
  await expect(link).toHaveText(publicUrl)
  const context = page.context()
  const [preview] = await Promise.all([
    context.waitForEvent('page', { timeout: 25_000 }),
    dialog.getByRole('button', { name: 'Open', exact: true }).click(),
  ])
  try {
    await expect(preview).toHaveURL(publicUrl)
    await expect(preview.getByTestId('owner-preview-band')).toBeVisible()
    await expect.poll(async () => (await fixture.readOwnChangeOrder(id))?.status, { timeout: 20_000 }).toBe('sent')
    expect((await fixture.readOwnChangeOrder(id))?.sent_at).toBeTruthy()
  } finally {
    await preview.close()
  }

  await page.goto('about:blank')
  await context.clearCookies()
  expect((await page.goto(publicUrl))?.status()).toBe(200)
  await expect(page.getByTestId('owner-preview-band')).toHaveCount(0)
  await expect(page.getByTestId('change-order-actions').getByRole('button', { name: 'Approve and sign', exact: true })).toBeVisible()
  return publicPath
}

async function verifyPresentedTotals(page: Page, baseTotal: number, orderTotal: number) {
  const rows = page.getByTestId('change-order-totals').locator('dl > div')
  const amounts = [
    { label: 'Current contract', amount: baseTotal },
    { label: 'This change order', amount: orderTotal },
    { label: 'New total', amount: baseTotal + orderTotal },
  ]
  for (const { label, amount } of amounts) {
    await expect(rows.filter({ has: page.getByText(label, { exact: true }) }).locator('dd')).toHaveText(CURRENCY.format(amount))
  }
}

async function verifyPublicContract(page: Page, fixture: Tenant, publicPath: string, order: Order, status: string, contractTotal: number) {
  expect((await page.goto(`/estimate/${fixture.shareToken}`))?.status()).toBe(200)
  const contract = page.getByTestId('contract-section')
  const row = contract.getByTestId('co-row').filter({ hasText: order.title })
  await expect(row).toHaveAttribute('href', publicPath)
  await expect(row.getByTestId('co-status')).toHaveText(status)
  await expect(contract.getByTestId('contract-total')).toHaveText(CURRENCY.format(contractTotal))
  await expect(page.getByText(fixture.lineDescription, { exact: true }).filter({ visible: true })).toBeVisible()
  expect((await fixture.readEstimate())?.total).toBe(fixture.total)
  expect((await fixture.readProject())?.total).toBe(contractTotal)
}

async function verifyPdf(page: Page, fixture: Tenant, baseURL: string, id: string, publicPath: string, order: Order, signer: string, info: TestInfo) {
  const link = page.getByRole('link', { name: 'Download PDF', exact: true })
  const href = `/api/change-orders/${id}/pdf?token=${publicPath.split('/').at(-1)}`
  await expect(link).toHaveAttribute('href', href)
  const response = await page.request.get(new URL(href, baseURL).href, { maxRedirects: 0 })
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')
  const pdf = await response.body()
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  const parsed = JSON.parse(execFileSync(process.env.QA_PYTHON || 'python', ['-c',
    'import sys,json,io;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()));print(json.dumps({"pages":len(r.pages),"text":" ".join(p.extract_text() or "" for p in r.pages)}))'],
  { input: pdf, encoding: 'utf8', timeout: 20_000 })) as { pages: number; text: string }
  expect(parsed.pages).toBeGreaterThanOrEqual(1)
  const text = parsed.text.replace(/\s+/g, ' ')
  for (const content of [order.title, order.reason, ...order.lines.map(line => line.description), signer]) {
    expect(text).toContain(content)
  }
  // The uppercase PDF label uses letter spacing, which pypdf can extract as spaces between letters.
  expect(text.replace(/\s/g, '').toLowerCase()).toContain(`approvedandsignedby${signer.replace(/\s/g, '').toLowerCase()}`)
  for (const amount of [fixture.total, order.total, fixture.total + order.total]) {
    expect(text).toContain(CURRENCY.format(amount))
  }
  await info.attach('signed-change-order.pdf', { body: pdf, contentType: 'application/pdf' })
}

async function withTenant(page: Page, baseURL: string, run: (tenant: Tenant) => Promise<void>) {
  const tenant = createQaFixture(baseURL)
  try {
    await tenant.seed()
    await run(tenant)
  } finally {
    try { await page.close() } finally { await tenant.cleanup() }
  }
}

test('[QA:CO-APPROVE-CONTRACT] a signed change order amends the contract, locks edits and produces a signed PDF', async ({ page, baseURL }, info) => {
  test.setTimeout(300_000)
  await withTenant(page, baseURL!, async fixture => {
    const originalDigest = await test.step('Accept the original estimate as the anonymous recipient', () => signOriginalEstimate(page, fixture, info))
    const order: Order = {
      title: 'Porch gate adjustment',
      reason: 'Adjust the gate work after approval.',
      lines: [
        { description: 'Install additional gate hardware', quantity: 2, unitPrice: 125 },
        { description: 'Credit for original hardware', quantity: 1, unitPrice: -25 },
      ],
      total: 225,
    }
    const { id, ownerPath } = await test.step('Create and save a draft with additional work and a credit', () => createOrder(page, fixture, order))
    const publicPath = await test.step('Open the owner share link and visit it without owner cookies', () => shareOrder(page, baseURL!, fixture, id))
    const signer = 'QA Change Order Signer'
    const newTotal = fixture.total + order.total

    await test.step('Approve online and verify the signed snapshot persisted', async () => {
      const lines = page.getByTestId('change-order-lines')
      await expect(lines.getByText(order.title, { exact: true })).toBeVisible()
      for (const line of order.lines) await expect(lines.getByText(line.description, { exact: true })).toBeVisible()
      await verifyPresentedTotals(page, fixture.total, order.total)
      await page.getByTestId('change-order-actions').getByRole('button', { name: 'Approve and sign', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Sign to approve this change order', exact: true })
      await drawSignature(page, dialog, signer)
      const [response] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname === `/api/change-orders/${id}/sign` && r.request().method() === 'POST', { timeout: 30_000 }),
        dialog.getByRole('button', { name: 'Sign & Approve', exact: true }).click(),
      ])
      expect(response.status()).toBe(200)
      await expect(page.getByTestId('response-status')).toContainText('Change order approved')
      const evidence = await fixture.readOwnChangeOrderEvidence(id)
      expect(evidence).toMatchObject({
        order: { status: 'accepted', client_response: 'accepted', total: order.total, responded_at: expect.any(String) },
        signature: { signer_name: signer, signed_total: order.total, signed_at: expect.any(String) },
      })
      const snapshot = evidence!.signature!.signed_content
      const fingerprint = createHash('sha256').update(canonicalJsonStringify(snapshot)).digest('hex')
      expect(response.request().postDataJSON()).toMatchObject({ contentFingerprint: fingerprint })
      expect(evidence!.signature!.snapshot_sha256).toBe(fingerprint)
      expect(snapshot).toMatchObject({
        change_order_id: id, estimate_id: fixture.estimateId, title: order.title, reason: order.reason, total: order.total,
        items: order.lines.map(line => ({ description: line.description, quantity: line.quantity, unit_price: line.unitPrice })),
        contract: { before: fixture.total, after: newTotal, revision: expect.stringMatching(/^[a-f0-9]{32}$/) },
      })
      await info.attach('change-order-signing-evidence.json', {
        body: JSON.stringify({ status: evidence!.order.status, fingerprint, snapshot }, null, 2),
        contentType: 'application/json',
      })
    })

    await test.step('Reload the signed public change order and inspect its PDF', async () => {
      expect((await page.reload())?.status()).toBe(200)
      await expect(page.getByTestId('response-status')).toContainText('Change order approved')
      await expect(page.getByTestId('approved-signature').getByRole('img', { name: `Signed by ${signer}`, exact: true })).toBeVisible()
      await expect(page.getByTestId('change-order-actions')).toHaveCount(0)
      await verifyPresentedTotals(page, fixture.total, order.total)
      await verifyPdf(page, fixture, baseURL!, id, publicPath, order, signer, info)
    })

    await test.step('Verify the public contract and the locked owner editor', async () => {
      await verifyPublicContract(page, fixture, publicPath, order, 'Approved', newTotal)
      expect((await fixture.readSignature())?.snapshot_sha256).toBe(originalDigest)
      await page.context().addCookies(fixture.cookies())
      expect((await page.goto(ownerPath))?.status()).toBe(200)
      const editor = page.getByTestId('change-order-editor')
      await expect(editor.getByTestId('change-order-lock-banner')).toContainText('Approved.')
      await expect(editor.getByRole('textbox', { name: 'Title', exact: true })).toBeDisabled()
      await expect(editor.getByRole('textbox', { name: 'Item 1 description', exact: true })).toBeDisabled()
      await expect(editor.getByRole('button', { name: 'Add item', exact: true })).toHaveCount(0)
      await expect(editor.getByTestId('change-order-signature')).toContainText(signer)
    })
  })
})

test('[QA:CO-DECLINE-CONTRACT] a declined change order leaves the contract and signature evidence untouched', async ({ page, baseURL }, info) => {
  test.setTimeout(300_000)
  await withTenant(page, baseURL!, async fixture => {
    const originalDigest = await signOriginalEstimate(page, fixture, info)
    const order: Order = {
      title: 'Optional trim work',
      reason: 'Offer an optional trim upgrade.',
      lines: [{ description: 'Add trim to the gate', quantity: 1, unitPrice: 75 }],
      total: 75,
    }
    const { id, ownerPath } = await createOrder(page, fixture, order)
    const publicPath = await shareOrder(page, baseURL!, fixture, id)
    const actions = page.getByTestId('change-order-actions')
    await actions.getByRole('button', { name: 'Decline', exact: true }).click()
    await actions.getByRole('button', { name: 'Yes, decline', exact: true }).click()
    await expect(page.getByTestId('response-status')).toContainText('Change order declined')
    await expect(page.getByTestId('approved-signature')).toHaveCount(0)
    expect(await fixture.readOwnChangeOrderEvidence(id)).toMatchObject({
      order: { status: 'declined', client_response: 'declined', total: order.total, responded_at: expect.any(String) }, signature: null,
    })
    await verifyPublicContract(page, fixture, publicPath, order, 'Declined', fixture.total)
    expect((await fixture.readSignature())?.snapshot_sha256).toBe(originalDigest)
    await page.context().addCookies(fixture.cookies())
    expect((await page.goto(ownerPath))?.status()).toBe(200)
    const banner = page.getByTestId('change-order-lock-banner')
    await expect(banner).toContainText('Declined.')
    await expect(banner.getByRole('button', { name: 'Revise and reopen', exact: true })).toBeVisible()
  })
})
