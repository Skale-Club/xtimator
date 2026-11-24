import type { Page } from '@playwright/test'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

function responseButton(page: Page, desktop: boolean) {
  return desktop
    ? page.getByTestId('proposal-bar').getByRole('button', { name: 'Accept', exact: true })
    : page.getByTestId('mobile-accept-bar').getByRole('button', { name: 'Accept Estimate', exact: true })
}

test('[QA:ESTIMATE-DECLINE-REOPEN] a public decline is recorded and the owner can reopen and revise the same estimate', async ({ context, page, baseURL }, info) => {
  test.setTimeout(240_000)
  const fixture = createQaFixture(baseURL!)
  const publicPath = `/estimate/${fixture.shareToken}`
  const projectPath = `/projects/${fixture.projectId}`
  const desktop = info.project.name === 'chromium'

  try {
    await fixture.seed()
    expect(await fixture.readEstimate()).toMatchObject({ client_response: null, status: 'sent' })
    expect(await fixture.readEstimateResponseActivity()).toEqual([])
    expect((await page.goto(publicPath))?.status()).toBe(200)
    await responseButton(page, desktop).click()
    const dialog = page.getByRole('dialog', { name: 'Sign to accept this estimate', exact: true })
    await dialog.getByRole('button', { name: 'Decline estimate', exact: true }).click()
    const confirmation = dialog.getByTestId('decline-confirm')
    await expect(confirmation.getByText('Decline this estimate?', { exact: true })).toBeVisible()
    expect(await fixture.readEstimate()).toMatchObject({ client_response: null, responded_at: null })
    await confirmation.getByRole('button', { name: 'Yes, decline', exact: true }).click()
    await expect(page.getByTestId('response-status')).toContainText('Estimate Declined')
    await expect(responseButton(page, desktop)).toHaveCount(0)
    expect(await fixture.readEstimate()).toMatchObject({
      id: fixture.estimateId, client_response: 'declined', responded_at: expect.any(String), is_current: true,
    })
    expect(await fixture.readProject()).toMatchObject({ status: 'declined' })
    expect(await fixture.readSignature()).toBeNull()
    const activity = await fixture.readEstimateResponseActivity()
    expect(activity).toEqual([{
      id: expect.any(String), event_type: 'estimate_declined', metadata: {}, created_at: expect.any(String),
    }])
    const [decline] = activity
    await page.close()

    await context.addCookies(fixture.cookies())
    const owner = await context.newPage()
    expect((await owner.goto(projectPath))?.status()).toBe(200)
    const reopen = owner.getByTestId('revise-and-reopen-btn')
    await expect(reopen).toBeVisible()
    await reopen.click()
    await expect(reopen).toHaveCount(0)
    await expect.poll(() => fixture.readEstimate()).toMatchObject({
      id: fixture.estimateId, share_token: fixture.shareToken, is_current: true,
      client_response: null, responded_at: null, total: fixture.total,
    })
    expect(await fixture.readProject()).toMatchObject({ status: 'sent' })

    const revised = `${fixture.lineDescription} with a reinforced handrail`
    if (desktop) {
      const line = owner.locator(`[data-item-id="${fixture.itemId}"]`).filter({ visible: true })
      const field = line.getByPlaceholder('Item description', { exact: true })
      await expect(field).toHaveValue(fixture.lineDescription)
      await field.fill(revised)
      await field.press('Tab')
    } else {
      const line = owner.locator(`[data-mobile-item-id="${fixture.itemId}"]`).filter({ visible: true })
      await line.getByRole('button', { name: /^Edit item:/ }).click()
      const sheet = owner.getByTestId('item-editor-sheet')
      const field = sheet.getByRole('textbox', { name: 'Description', exact: true })
      await expect(field).toHaveValue(fixture.lineDescription)
      await field.fill(revised)
      await field.press('Tab')
      await sheet.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(sheet).toHaveCount(0)
    }
    await expect.poll(() => fixture.readOwn('estimate_items', fixture.itemId)).toMatchObject({ description: revised })
    await expect(owner.getByText('Saving…', { exact: true })).toHaveCount(0)
    await expect(owner.getByText('Not saved', { exact: true })).toHaveCount(0)
    expect((await owner.reload())?.status()).toBe(200)
    if (desktop) {
      const line = owner.locator(`[data-item-id="${fixture.itemId}"]`).filter({ visible: true })
      await expect(line.getByPlaceholder('Item description', { exact: true })).toHaveValue(revised)
    } else {
      const line = owner.locator(`[data-mobile-item-id="${fixture.itemId}"]`).filter({ visible: true })
      await expect(line.getByText(revised, { exact: true })).toBeVisible()
    }
    await owner.close()

    await context.clearCookies()
    const customer = await context.newPage()
    expect((await customer.goto(publicPath))?.status()).toBe(200)
    await expect(customer).toHaveURL(new URL(publicPath, baseURL!).href)
    await expect(customer.getByText(revised, { exact: true }).filter({ visible: true })).toBeVisible()
    await expect(customer.getByTestId('response-status')).toHaveCount(0)
    await expect(responseButton(customer, desktop)).toBeEnabled()
    expect(await fixture.readSignature()).toBeNull()
    expect(await fixture.readEstimateResponseActivity()).toEqual([
      decline,
      { id: expect.any(String), event_type: 'estimate_response_cleared',
        metadata: { source: 'manual' }, created_at: expect.any(String) },
    ])
  } finally {
    const closes = await Promise.allSettled(context.pages().map(openPage => openPage.close()))
    await fixture.cleanup()
    for (const close of closes) if (close.status === 'rejected') throw close.reason
  }
})
