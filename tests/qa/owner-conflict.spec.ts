import type { Page } from '@playwright/test'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

type Tenant = ReturnType<typeof createQaFixture>

function lineOn(page: Page, fixture: Tenant, desktop: boolean) {
  const attribute = desktop ? 'data-item-id' : 'data-mobile-item-id'
  return page.locator(`[${attribute}="${fixture.itemId}"]`).filter({ visible: true })
}

function editorTotal(page: Page, amount: string) {
  return page.locator('[data-page-block-id="totals"]').filter({ visible: true })
    .getByText('Total', { exact: true }).locator('..').getByText(amount, { exact: true })
}

async function editLine(page: Page, fixture: Tenant, desktop: boolean, field: 'description' | 'quantity', value: string) {
  const line = lineOn(page, fixture, desktop)
  if (!desktop) await line.getByRole('button', { name: /^Edit item:/ }).click()
  const editor = desktop ? line : page.getByTestId('item-editor-sheet')
  const input = field === 'quantity'
    ? editor.getByRole('spinbutton', { name: desktop ? 'Qty' : 'Quantity', exact: true })
    : desktop
      ? editor.getByPlaceholder('Item description', { exact: true })
      : editor.getByRole('textbox', { name: 'Description', exact: true })
  await input.fill(value)
  await expect(input).toHaveValue(value)
  await input.press('Tab')
  if (!desktop) {
    await editor.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(editor).toHaveCount(0)
  }
}

async function expectLineDescription(page: Page, fixture: Tenant, desktop: boolean, description: string) {
  const line = lineOn(page, fixture, desktop)
  if (desktop) await expect(line.getByPlaceholder('Item description', { exact: true })).toHaveValue(description)
  else await expect(line.getByText(description, { exact: true })).toBeVisible()
}

test('[QA:ESTIMATE-OWNER-CONFLICT] a stale owner tab cannot overwrite the newer estimate and can reload and save a different change', async ({ page, context, baseURL }, info) => {
  test.setTimeout(240_000)
  const fixture = createQaFixture(baseURL!)
  const projectPath = `/projects/${fixture.projectId}`
  const desktop = info.project.name === 'chromium'
  const description = 'Install painted cedar railing with reinforced posts'
  try {
    await fixture.seed()
    await context.addCookies(fixture.cookies())
    const stale = await context.newPage()
    for (const editor of [page, stale]) {
      expect((await editor.goto(projectPath))?.status()).toBe(200)
      await expect(editor.locator('[data-editor-dock]').getByRole('button', { name: 'Share', exact: true })).toBeEnabled()
      await expectLineDescription(editor, fixture, desktop, fixture.lineDescription)
    }

    await editLine(page, fixture, desktop, 'description', description)
    await expect.poll(() => fixture.readOwn('estimate_items', fixture.itemId)).toMatchObject({
      description, quantity: 2, total: 1000,
    })
    await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0)
    await expectLineDescription(stale, fixture, desktop, fixture.lineDescription)

    await editLine(stale, fixture, desktop, 'quantity', '3')
    const conflict = stale.getByRole('button', { name: 'Reload latest', exact: true })
    await expect(stale.getByText(/This estimate was changed elsewhere since you last loaded it/)).toBeVisible()
    await expect(stale.getByRole('button', { name: 'Keep my changes', exact: true })).toBeVisible()
    expect(await fixture.readOwn('estimate_items', fixture.itemId)).toMatchObject({ description, quantity: 2, total: 1000 })
    expect(await fixture.readEstimate()).toMatchObject({ id: fixture.estimateId, is_current: true, total: 1000 })

    await conflict.click()
    await expectLineDescription(stale, fixture, desktop, description)
    await expect(conflict).toHaveCount(0)
    await editLine(stale, fixture, desktop, 'quantity', '3')
    await expect.poll(() => fixture.readOwn('estimate_items', fixture.itemId)).toMatchObject({
      description, quantity: 3, total: 1500,
    })
    await expect.poll(() => fixture.readEstimate()).toMatchObject({ id: fixture.estimateId, is_current: true, total: 1500 })
    await expect(stale.getByText('Saving…', { exact: true })).toHaveCount(0)
    expect((await stale.reload())?.status()).toBe(200)
    await expectLineDescription(stale, fixture, desktop, description)
    await expect(editorTotal(stale, '$1,500.00')).toBeVisible()

    // The first tab still has its earlier quantity and version token.
    await expectLineDescription(page, fixture, desktop, description)
    await expect(editorTotal(page, '$1,000.00')).toBeVisible()
    await editLine(page, fixture, desktop, 'quantity', '4')
    const keep = page.getByRole('button', { name: 'Keep my changes', exact: true })
    await expect(page.getByText(/This estimate was changed elsewhere since you last loaded it/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reload latest', exact: true })).toBeVisible()
    await expect(keep).toBeVisible()
    expect(await fixture.readOwn('estimate_items', fixture.itemId)).toMatchObject({ description, quantity: 3, total: 1500 })
    expect(await fixture.readEstimate()).toMatchObject({ id: fixture.estimateId, is_current: true, total: 1500 })

    await keep.click()
    await expect.poll(() => fixture.readOwn('estimate_items', fixture.itemId)).toMatchObject({
      description, quantity: 4, total: 2000,
    })
    await expect.poll(() => fixture.readEstimate()).toMatchObject({ id: fixture.estimateId, is_current: true, total: 2000 })
    await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0)
    await expect(keep).toHaveCount(0)
    expect((await page.reload())?.status()).toBe(200)
    await expectLineDescription(page, fixture, desktop, description)
    await expect(editorTotal(page, '$2,000.00')).toBeVisible()
    await Promise.all([page.close(), stale.close()])

    await context.clearCookies()
    const customer = await context.newPage()
    expect((await customer.goto(`/estimate/${fixture.shareToken}`))?.status()).toBe(200)
    const publicLine = customer.locator(`[data-track-section="item:${fixture.itemId}"]`).filter({ visible: true })
    await expect(publicLine.getByText(description, { exact: true })).toBeVisible()
    await expect(publicLine.getByText('$2,000.00', { exact: true })).toBeVisible()
    if (desktop) await expect(publicLine.getByRole('cell', { name: '4', exact: true })).toBeVisible()
    else await expect(publicLine).toContainText(/4\s+[^×]*×\s*\$500\.00/)
  } finally {
    const closed = await Promise.allSettled(context.pages().map(openPage => openPage.close()))
    await fixture.cleanup()
    for (const result of closed) if (result.status === 'rejected') throw result.reason
  }
})
