import type { Page, TestInfo } from '@playwright/test'
import { test, expect } from './test'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createQaFixture } from './fixtures/tenant'

let fixture: ReturnType<typeof createQaFixture>

test.beforeEach(async ({ context, baseURL }) => {
  fixture = createQaFixture(baseURL!)
  await fixture.seed()
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === baseURL || url.origin === 'https://prmqgcrnpuvpzruyzvuv.supabase.co') return route.continue()
    return route.abort('blockedbyclient')
  })
})
test.afterEach(async ({ page }) => {
  // Stop application requests before deleting the owned session and tenant.
  try { await page.close() } finally { await fixture?.cleanup() }
})

async function owner(page: Page) { await page.context().addCookies(fixture.cookies()) }
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
}

test('[QA:SESSION-OWNED] the owner signs out and neither an absent nor replayed revoked cookie reopens the dashboard', async ({ page, context }, info) => {
  const originalCookies = fixture.cookies()
  await context.addCookies(originalCookies)
  const session = await page.request.get('/api/auth/session')
  expect(session.status()).toBe(200)
  const payload = await session.json()
  expect(payload.user?.id).toBe(fixture.userId)
  expect(typeof payload.accessToken).toBe('string')
  expect((await page.goto('/dashboard'))?.status()).toBe(200)
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText(fixture.projectName, { exact: true }).filter({ visible: true }).first()).toBeVisible()

  const desktop = info.project.name === 'chromium'
  if (desktop) {
    await page.getByTestId('app-sidebar').getByRole('button', { name: /Switch company$/ }).click()
  } else {
    await page.getByTestId('mobile-header').getByRole('button')
      .and(page.locator('button[aria-haspopup="dialog"]')).click()
  }
  const signOut = desktop
    ? page.getByRole('menuitem', { name: 'Sign Out', exact: true })
    : page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: 'Sign Out', exact: true })
  const origin = new URL(page.url()).origin
  const [logout] = await Promise.all([
    page.waitForResponse(response => response.url() === `${origin}/api/auth/session`
      && response.request().method() === 'DELETE', { timeout: 20_000 }),
    signOut.click(),
  ])
  expect(logout.status()).toBe(200)
  expect(logout.headers()['content-type']).toContain('application/json')
  await expect(page).toHaveURL(url => url.origin === origin && url.pathname === '/')
  await page.waitForLoadState('load')
  expect((await context.cookies()).some(({ name }) => name === 'xtimator_session')).toBe(false)

  await context.clearCookies()
  const absent = await page.request.get('/api/auth/session')
  expect(absent.status()).toBe(200)
  const anonymous = await absent.json()
  expect(anonymous.user === null && anonymous.accessToken === null).toBe(true)
  await page.goto('/dashboard', { waitUntil: 'load' })
  await expect(page).not.toHaveURL(/\/dashboard(?:[?#]|$)/)

  await context.addCookies(originalCookies)
  const replayed = await page.request.get('/api/auth/session')
  expect(replayed.status()).toBe(200)
  const revoked = await replayed.json()
  expect(revoked.user === null && revoked.accessToken === null, 'The revoked cookie cannot authenticate').toBe(true)
  await page.goto('/dashboard', { waitUntil: 'load' })
  await expect(page).not.toHaveURL(/\/dashboard(?:[?#]|$)/)
  await expect(page.getByText(fixture.projectName, { exact: true })).toHaveCount(0)
})

test('[QA:TENANT-ISOLATION] tenant identity cannot read another tenant project or owner PDF', async ({ page, baseURL }) => {
  const other = createQaFixture(baseURL!)
  try {
    await other.seed()
    await owner(page)
    const pdf = await page.request.get(`/api/estimates/${other.estimateId}/pdf`)
    expect([403, 404]).toContain(pdf.status())
    const denied = await page.goto(`/projects/${other.projectId}`)
    // A streamed notFound response may have sent its 200 headers already.
    expect([200, 404]).toContain(denied?.status())
    await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible()
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
    await expect(page.getByText(other.projectName, { exact: true })).toHaveCount(0)
    await expect(page.getByText(other.lineDescription, { exact: true })).toHaveCount(0)
    expect((await other.readProject())?.name).toBe(other.projectName)
    expect((await fixture.readProject())?.name).toBe(fixture.projectName)
  } finally {
    try { await page.close() } finally { await other.cleanup() }
  }
})

test('[QA:CLIENT-CRUD] client form edits persist and survive navigation and reload', async ({ page }) => {
  await owner(page)
  await page.goto('/clients')
  await page.getByRole('button', { name: 'Add Client', exact: true }).click()
  const createdName = `${fixture.clientName} Created`
  await page.getByPlaceholder('Client name', { exact: true }).fill(createdName)
  await page.getByRole('dialog').getByRole('button', { name: 'Add Client', exact: true }).click()
  await page.getByText(createdName, { exact: true }).first().click()
  await expect(page).toHaveURL(/\/clients\/[a-f0-9-]{36}$/)
  const createdId = new URL(page.url()).pathname.split('/').at(-1)!
  expect((await fixture.readClient(createdId))?.name).toBe(createdName)
  await page.getByRole('button', { name: `Client actions: ${createdName}` }).click()
  await page.getByRole('menuitem', { name: 'Edit client', exact: true }).click()
  const name = `${fixture.clientName} Updated`
  await page.getByPlaceholder('Client name', { exact: true }).fill(name)
  await page.getByRole('button', { name: 'Update Client', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(async () => (await fixture.readClient(createdId))?.name).toBe(name)
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  // Use the application's navigation while its refresh completes, rather than
  // racing a second document load against the router's refreshed detail page.
  await page.getByTestId('app-sidebar').or(page.getByTestId('bottom-nav')).filter({ visible: true })
    .getByRole('link', { name: 'Clients', exact: true }).click()
  await expect(page).toHaveURL(/\/clients$/)
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible()
  await page.getByText(name, { exact: true }).filter({ visible: true }).click()
  await expect(page).toHaveURL(new RegExp(`/clients/${createdId}$`))
  await page.getByRole('button', { name: `Client actions: ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Delete client', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect.poll(async () => await fixture.readClient(createdId)).toBeNull()
  await expect(page).toHaveURL(/\/clients$/)
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible()
  await expect(page.getByText(name, { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible()
  await expect(page.getByText(name, { exact: true })).toHaveCount(0)
})

test('[QA:ESTIMATE-EDIT] line edits persist, preserve totals and render in editor and public document', async ({ page }, info) => {
  await owner(page)
  await page.goto(`/projects/${fixture.projectId}`)
  const description = `${fixture.lineDescription} with stainless fasteners`
  if (info.project.name === 'chromium') {
    await page.getByPlaceholder('Item description', { exact: true }).fill(description)
    await page.getByPlaceholder('Item description', { exact: true }).press('Tab')
  } else {
    await page.getByText(fixture.lineDescription, { exact: true }).first().click()
    await page.getByRole('textbox', { name: 'Description', exact: true }).fill(description)
    await page.getByRole('textbox', { name: 'Description', exact: true }).press('Tab')
    await page.keyboard.press('Escape')
  }
  await expect.poll(async () => (await fixture.readOwn('estimate_items', fixture.itemId))?.description).toBe(description)
  expect(Number((await fixture.readEstimate())?.total)).toBe(fixture.total)
  if (info.project.name === 'chromium') {
    await page.getByRole('button', { name: 'Page view', exact: true }).click()
    await expect(page.getByText(description, { exact: true }).first()).toBeVisible()
    await screenshot(page, info, 'paginated-editor')
    await page.getByRole('button', { name: 'Full width view', exact: true }).click()
  }
  await page.reload()
  await expect.poll(async () => (await fixture.readOwn('estimate_items', fixture.itemId))?.description).toBe(description)
  await page.goto('about:blank')
  await page.context().clearCookies()
  await page.goto(`/estimate/${fixture.shareToken}`)
  await expect(page.getByText(description, { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByText('$1,000.00', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await noOverflow(page)
  await screenshot(page, info, 'edited-public-document')
})

test('[QA:PUBLIC-SHARE] anonymous document shows persisted content and rejects an unknown token', async ({ page }, info) => {
  expect((await page.goto(`/estimate/${fixture.shareToken}`))?.status()).toBe(200)
  await expect(page.getByText(fixture.lineDescription, { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByText(fixture.companyName, { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText('$1,000.00', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await noOverflow(page)
  await screenshot(page, info, 'anonymous-estimate')
  const missingToken = randomUUID()
  const missing = await page.goto(`/estimate/${missingToken}`)
  // Next streams its notFound UI with HTTP 200 once headers have been sent.
  expect([200, 404]).toContain(missing?.status())
  await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible()
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
  await expect(page.getByText(fixture.companyName, { exact: true })).toHaveCount(0)
  const denied = await page.request.get(`/api/estimates/${fixture.estimateId}/pdf?token=${missingToken}`)
  expect(denied.status()).toBe(404)
  expect(denied.headers()['cache-control']).toContain('no-store')
})

test('[QA:SIGNATURE-PDF] public signing persists frozen evidence and produces a semantic signed PDF', async ({ page }, info) => {
  await page.goto(`/estimate/${fixture.shareToken}`)
  const open = info.project.name === 'chromium'
    ? page.getByTestId('proposal-bar').getByRole('button', { name: 'Accept', exact: true })
    : page.getByTestId('mobile-accept-bar').getByRole('button', { name: 'Accept Estimate', exact: true })
  await open.click()
  const dialog = page.getByRole('dialog')
  const signer = 'QA Synthetic Signer'
  await dialog.getByLabel('Your full name').fill(signer)
  const canvas = dialog.locator('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Signature canvas is not visible')
  await page.mouse.move(box.x + box.width * .1, box.y + box.height * .6)
  await page.mouse.down()
  for (const [x, y] of [[.25, .3], [.4, .7], [.6, .25], [.8, .6]]) await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 3 })
  await page.mouse.up()
  const [signed] = await Promise.all([
    page.waitForResponse(response => response.url().includes(`/api/estimates/${fixture.estimateId}/sign`) && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'Sign & Accept Estimate', exact: true }).click(),
  ])
  expect(signed.status()).toBe(200)
  await expect.poll(async () => (await fixture.readSignature())?.signer_name).toBe(signer)
  const evidence = await fixture.readSignature()
  expect(evidence?.snapshot_sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(JSON.stringify(evidence?.signed_content)).toContain(fixture.lineDescription)
  expect((await fixture.readEstimate())?.client_response).toBe('accepted')
  const link = page.getByRole('link', { name: 'Download PDF', exact: true })
  await expect(link).toBeVisible()
  const response = await page.request.get((await link.getAttribute('href'))!)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')
  const pdf = await response.body()
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  const parsed = JSON.parse(execFileSync(process.env.QA_PYTHON || 'python', ['-c',
    'import sys,json,io;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()));print(json.dumps({"pages":len(r.pages),"text":" ".join(p.extract_text() or "" for p in r.pages)}))'], { input: pdf }).toString())
  expect(parsed.pages).toBeGreaterThanOrEqual(2)
  expect(parsed.text).toContain(fixture.companyName)
  expect(parsed.text).toContain(fixture.lineDescription)
  expect(parsed.text).toContain(signer)
  expect(parsed.text).toContain('1,000.00')
  await info.attach('signed-estimate.pdf', { body: pdf, contentType: 'application/pdf' })
  await page.reload()
  await expect(page.getByTestId('response-status')).toContainText('Estimate Accepted')
  await noOverflow(page)
})
