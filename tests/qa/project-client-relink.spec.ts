import { execFileSync } from 'node:child_process'
import type { Page } from '@playwright/test'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

function projectEntry(page: Page, projectId: string, desktop: boolean) {
  const link = page.locator(`a[href="/projects/${projectId}"][aria-hidden="true"]`)
  return desktop ? page.getByRole('row').filter({ has: link })
    : link.locator('xpath=..').filter({ has: page.getByRole('button', { name: 'Actions', exact: true }) })
}

function billTo(page: Page, paginated = false) {
  return page.getByText('Bill To', { exact: true }).filter({ visible: true })
    .locator(paginated ? 'xpath=..' : 'xpath=../..')
}

test('[QA:PROJECT-CLIENT-RELINK] changing the owned project recipient updates the workspace, public document and owner PDF', async ({ page, context, baseURL }, info) => {
  test.setTimeout(240_000)
  const fixture = createQaFixture(baseURL!)
  const other = createQaFixture(baseURL!)
  const replacement = `${fixture.companyName} Replacement recipient`
  const desktop = info.project.name === 'chromium'
  const projectPath = `/projects/${fixture.projectId}`
  async function verifyWidthRecipient() {
    if (!desktop) await page.getByRole('button', { name: 'Show estimate details', exact: true }).click()
    await expect(billTo(page).getByText(replacement, { exact: true })).toBeVisible()
    await expect(billTo(page).getByText(fixture.clientName, { exact: true })).toHaveCount(0)
  }

  try {
    await fixture.seed()
    await other.seed()
    await context.addCookies(fixture.cookies())
    expect((await page.goto('/clients'))?.status()).toBe(200)
    await page.getByRole('button', { name: 'Add Client', exact: true }).click()
    const addClient = page.getByRole('dialog')
    await addClient.getByPlaceholder('Client name', { exact: true }).fill(replacement)
    await addClient.getByRole('button', { name: 'Add Client', exact: true }).click()
    await expect(addClient).toHaveCount(0)
    await page.getByText(replacement, { exact: true }).filter({ visible: true }).click()
    await expect(page).toHaveURL(/\/clients\/[a-f0-9-]{36}$/)
    const replacementId = new URL(page.url()).pathname.split('/').at(-1)!
    expect(replacementId).not.toBe(fixture.clientId)
    expect(await fixture.readClient(replacementId)).toMatchObject({ name: replacement })

    const navigation = page.getByTestId('app-sidebar').or(page.getByTestId('bottom-nav')).filter({ visible: true })
    await navigation.getByRole('link', { name: 'Projects', exact: true }).click()
    await expect(page).toHaveURL(/\/projects$/)
    const entry = projectEntry(page, fixture.projectId, desktop)
    await expect(entry.getByText(fixture.clientName, { exact: true })).toBeVisible()
    if (desktop) await entry.getByRole('button', { name: fixture.clientName, exact: true }).click()
    else {
      await entry.getByRole('button', { name: 'Actions', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Change client', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Unlink client', exact: true }).click()
    await expect.poll(() => fixture.readProject()).toMatchObject({ client_id: null })
    await expect(entry.getByText(fixture.clientName, { exact: true })).toHaveCount(0)

    if (desktop) await entry.getByRole('button', { name: '+ Add client', exact: true }).click()
    else {
      await entry.getByRole('button', { name: 'Actions', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Add client', exact: true }).click()
    }
    // Wait for actual tenant options before proving the foreign option is absent.
    await expect(page.getByRole('option', { name: fixture.clientName, exact: true })).toBeVisible()
    const search = page.getByPlaceholder('Search clients...', { exact: true })
    await search.fill(other.clientName)
    await expect(page.getByText('No clients found.', { exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: other.clientName, exact: true })).toHaveCount(0)
    await search.fill(replacement)
    await page.getByRole('option', { name: replacement, exact: true }).click()
    await expect.poll(() => fixture.readProject()).toMatchObject({ id: fixture.projectId, client_id: replacementId })
    await expect(entry.getByText(replacement, { exact: true })).toBeVisible()

    expect((await page.goto(projectPath))?.status()).toBe(200)
    await verifyWidthRecipient()
    expect((await page.reload())?.status()).toBe(200)
    await verifyWidthRecipient()
    if (desktop) {
      const pageView = page.getByRole('button', { name: 'Page view', exact: true })
      await pageView.click()
      await expect(pageView).toHaveAttribute('aria-pressed', 'true')
      await expect(billTo(page, true).getByText(replacement, { exact: true })).toBeVisible()
      await expect(billTo(page, true).getByText(fixture.clientName, { exact: true })).toHaveCount(0)
    }
    expect(await fixture.readClient()).toMatchObject({ name: fixture.clientName })
    expect(await fixture.readClient(replacementId)).toMatchObject({ name: replacement })
    expect(await other.readProject()).toMatchObject({ client_id: other.clientId })
    expect(await other.readClient()).toMatchObject({ name: other.clientName })
    expect(await fixture.readEstimate()).toMatchObject({
      id: fixture.estimateId, project_id: fixture.projectId, share_token: fixture.shareToken, total: fixture.total,
    })

    const pdf = await page.request.get(`/api/estimates/${fixture.estimateId}/pdf`, { maxRedirects: 0, timeout: 30_000 })
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    const pdfBody = await pdf.body()
    expect(pdfBody.subarray(0, 5).toString()).toBe('%PDF-')
    const text = execFileSync(process.env.QA_PYTHON || 'python', ['-c',
      'import io,sys;from pypdf import PdfReader;print(" ".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages))',
    ], { input: pdfBody, encoding: 'utf8', timeout: 15_000 })
      .replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-')
    expect(text).toContain(replacement)
    expect(text).not.toContain(fixture.clientName)
    expect(text).not.toContain(other.clientName)

    await page.close()
    await context.clearCookies()
    const customer = await context.newPage()
    expect((await customer.goto(`/estimate/${fixture.shareToken}`))?.status()).toBe(200)
    await expect(billTo(customer).getByText(replacement, { exact: true })).toBeVisible()
    await expect(customer.getByText(fixture.clientName, { exact: true })).toHaveCount(0)
    await expect(customer.getByText(other.clientName, { exact: true })).toHaveCount(0)
  } finally {
    const closed = await Promise.allSettled(context.pages().map(openPage => openPage.close()))
    const cleaned = await Promise.allSettled([fixture.cleanup(), other.cleanup()])
    for (const result of [...closed, ...cleaned]) if (result.status === 'rejected') throw result.reason
  }
})
