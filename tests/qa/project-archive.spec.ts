import type { Page } from '@playwright/test'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

function projectEntry(page: Page, projectId: string, desktop: boolean) {
  const link = page.locator(`a[href="/projects/${projectId}"][aria-hidden="true"]`)
  return desktop
    ? page.getByRole('row').filter({ has: link })
    : link.locator('xpath=..').filter({ has: page.getByRole('button', { name: 'Actions', exact: true }) })
}

async function showView(page: Page, view: 'Active' | 'Archived', desktop: boolean) {
  const matchesView = (url: URL) => url.pathname === '/projects'
    && url.searchParams.get('status') === (view === 'Archived' ? 'archived' : null)
  if (desktop) {
    const option = page.getByRole('radiogroup', { name: 'View', exact: true })
      .getByRole('radio', { name: view, exact: true })
    await option.click()
    await expect(page).toHaveURL(matchesView)
    await expect(option).toBeChecked()
  } else {
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    const filters = page.getByRole('dialog', { name: 'Filters', exact: true })
    const option = filters.getByRole('button', { name: view, exact: true })
    await option.click()
    await expect(page).toHaveURL(matchesView)
    await expect(option).toHaveAttribute('aria-pressed', 'true')
    await filters.getByRole('button', { name: 'Show 1 result', exact: true }).click()
    await expect(filters).toHaveCount(0)
  }
}

test('[QA:PROJECT-ARCHIVE-RESTORE] moves an owned project between views without removing its estimate or public link', async ({ context, page, baseURL }, info) => {
  test.setTimeout(240_000)
  const fixture = createQaFixture(baseURL!)
  const unrelated = createQaFixture(baseURL!)
  const desktop = info.project.name === 'chromium'
  const publicPath = `/estimate/${fixture.shareToken}`
  const preservedProject = {
    id: fixture.projectId, company_id: fixture.companyId, client_id: fixture.clientId,
    status: 'sent', deleted_at: null, total: fixture.total,
  }
  async function verifyPublicLink() {
    await context.clearCookies()
    const customer = await context.newPage()
    try {
      expect((await customer.goto(publicPath))?.status()).toBe(200)
      await expect(customer.getByText(fixture.lineDescription, { exact: true }).filter({ visible: true })).toBeVisible()
    } finally {
      await customer.close()
    }
  }

  async function verifyProjectRelations() {
    expect(await fixture.readClient()).toMatchObject({ id: fixture.clientId, name: fixture.clientName })
    expect(await fixture.readEstimate()).toMatchObject({
      id: fixture.estimateId, project_id: fixture.projectId, share_token: fixture.shareToken,
      is_current: true, status: 'sent', total: fixture.total,
    })
    expect(await unrelated.readProject()).toMatchObject({
      id: unrelated.projectId, client_id: unrelated.clientId, status: 'sent',
      archived_at: null, deleted_at: null, total: unrelated.total,
    })
    expect(await unrelated.readEstimate()).toMatchObject({
      id: unrelated.estimateId, share_token: unrelated.shareToken, project_id: unrelated.projectId,
      is_current: true, status: 'sent',
    })
  }

  try {
    await fixture.seed()
    await unrelated.seed()
    await context.addCookies(fixture.cookies())
    expect((await page.goto('/projects'))?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
    await expect(page.getByText(unrelated.projectName, { exact: true })).toHaveCount(0)
    expect(await fixture.readProject()).toMatchObject({ ...preservedProject, archived_at: null })

    const entry = projectEntry(page, fixture.projectId, desktop)
    await expect(entry.getByText(fixture.projectName, { exact: true })).toBeVisible()
    await entry.getByRole('button', { name: 'Actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Archive', exact: true }).click()
    await expect(entry).toHaveCount(0)
    const archived = await fixture.readProject()
    expect(archived).toMatchObject({ ...preservedProject, archived_at: expect.any(String) })
    await verifyProjectRelations()

    await showView(page, 'Archived', desktop)
    await expect(entry.getByText(fixture.projectName, { exact: true })).toBeVisible()
    expect((await page.reload())?.status()).toBe(200)
    await expect(entry.getByText(fixture.projectName, { exact: true })).toBeVisible()
    expect(await fixture.readProject()).toMatchObject({ ...preservedProject, archived_at: archived?.archived_at })
    await page.close()
    await verifyPublicLink()

    await context.addCookies(fixture.cookies())
    const restored = await context.newPage()
    expect((await restored.goto('/projects?status=archived'))?.status()).toBe(200)
    const restoredEntry = projectEntry(restored, fixture.projectId, desktop)
    await restoredEntry.getByRole('button', { name: 'Actions', exact: true }).click()
    await restored.getByRole('menuitem', { name: 'Unarchive', exact: true }).click()
    await expect(restoredEntry).toHaveCount(0)
    expect(await fixture.readProject()).toMatchObject({ ...preservedProject, archived_at: null })

    await showView(restored, 'Active', desktop)
    await expect(restoredEntry.getByText(fixture.projectName, { exact: true })).toBeVisible()
    expect((await restored.reload())?.status()).toBe(200)
    await expect(restoredEntry.getByText(fixture.projectName, { exact: true })).toBeVisible()
    await expect(restored.getByText(unrelated.projectName, { exact: true })).toHaveCount(0)
    await verifyProjectRelations()
    await restored.close()
    await verifyPublicLink()
  } finally {
    const closes = await Promise.allSettled(context.pages().map(openPage => openPage.close()))
    const cleanups = await Promise.allSettled([fixture.cleanup(), unrelated.cleanup()])
    for (const result of [...closes, ...cleanups]) if (result.status === 'rejected') throw result.reason
  }
})
