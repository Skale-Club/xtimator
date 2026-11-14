import { expect, test, type Locator, type Page } from '@playwright/test'

// The dev fixture uses local messages and no account. Backend/AI calls are not
// part of these geometry checks; production still requires the owner's session.
test.use({ storageState: { cookies: [], origins: [] } })

async function openPanel(page: Page) {
  await page.goto('/dev/chat-bubble')
  await page.getByRole('button', { name: 'Open chat assistant' }).click()
  const dialog = page.getByRole('dialog', { name: 'Xtimator AI' })
  await expect(dialog.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible()
  return dialog
}

async function drag(page: Page, target: Locator, dx: number, dy: number) {
  const box = (await target.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 })
  await page.mouse.up()
}

for (const width of [320, 390, 1440]) {
  test(`assistant window stays compact, readable and resizable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const dialog = await openPanel(page)
    const initial = (await dialog.boundingBox())!
    expect(initial.height).toBeLessThan(844 * 0.82)
    expect(initial.x).toBeGreaterThanOrEqual(12)
    expect(initial.x + initial.width).toBeLessThanOrEqual(width - 11)
    await expect(dialog.locator('header img')).toHaveAttribute('src', '/icons/logo.png')
    expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)

    // The top handle changes height independently of moving the header.
    await drag(page, dialog.getByRole('button', { name: 'Resize chat height', exact: true }), 0, 48)
    await expect.poll(async () => (await dialog.boundingBox())!.height).toBeLessThan(initial.height - 40)
    const reduced = (await dialog.boundingBox())!
    expect(Math.abs(reduced.y + reduced.height - initial.y - initial.height)).toBeLessThan(2)

    // Even extreme corner resize attempts cannot widen the page.
    await drag(page, dialog.getByRole('button', { name: 'Resize chat window', exact: true }), -500, -500)
    const small = (await dialog.boundingBox())!
    expect(small.width).toBeLessThanOrEqual(width - 24)
    expect(small.width).toBeGreaterThanOrEqual(Math.min(300, width - 24))
    expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await expect(dialog.getByRole('button', { name: 'Send', exact: true })).toBeVisible()
  })
}

test('moving, minimizing and reloading preserve the chosen window and its draft', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const dialog = await openPanel(page)
  const input = dialog.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('Keep this long job description while I check the dashboard.\nInclude cleanup and disposal.')
  await drag(page, dialog.locator('header h2'), -160, -80)
  const moved = (await dialog.boundingBox())!
  await dialog.getByRole('button', { name: 'Minimize chat' }).click()
  await page.getByRole('button', { name: 'Open chat assistant' }).click()
  await expect(input).toHaveValue(/Keep this long job description/)
  const reopened = (await dialog.boundingBox())!
  expect(reopened).toEqual(moved)
  await page.reload()
  await page.getByRole('button', { name: 'Open chat assistant' }).click()
  expect(await page.getByRole('dialog', { name: 'Xtimator AI' }).boundingBox()).toEqual(moved)
})

test('a long draft and Send remain inside a keyboard-sized visual viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const dialog = await openPanel(page)
  const input = dialog.getByRole('textbox', { name: 'Message', exact: true })
  const draft = 'Install cedar fencing, remove the existing fence, and haul all debris.\n'.repeat(30)
  await input.fill(draft)
  const before = (await dialog.boundingBox())!
  await page.evaluate(() => {
    const viewport = window.visualViewport!
    Object.defineProperty(viewport, 'height', { configurable: true, value: 300 })
    Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 70 })
    viewport.dispatchEvent(new Event('resize'))
  })
  await expect.poll(async () => (await dialog.boundingBox())!.height).toBeLessThanOrEqual(276)
  const send = (await dialog.getByRole('button', { name: 'Send', exact: true }).boundingBox())!
  expect(send.y + send.height).toBeLessThanOrEqual(358)
  expect(send.y).toBeGreaterThanOrEqual(82)
  await expect.poll(() => input.evaluate(el => getComputedStyle(el).overflowY)).toBe('auto')
  await expect(input).toHaveValue(draft)
  await page.evaluate(() => {
    Reflect.deleteProperty(window.visualViewport!, 'height')
    Reflect.deleteProperty(window.visualViewport!, 'offsetTop')
    window.visualViewport!.dispatchEvent(new Event('resize'))
  })
  await expect.poll(async () => (await dialog.boundingBox())!.height).toBe(before.height)
  await expect(input).toHaveValue(draft)
})

test('finger gestures move and resize the phone window without moving the page', async ({ page, browserName, context }) => {
  test.skip(browserName !== 'chromium', 'CDP sends actual touch gestures to Chromium.')
  await page.setViewportSize({ width: 390, height: 844 })
  const dialog = await openPanel(page)
  const client = await context.newCDPSession(page)
  const swipe = async (target: Locator, dx: number, dy: number) => {
    const box = (await target.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy }] })
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  const before = (await dialog.boundingBox())!
  await swipe(dialog.locator('header h2'), 0, -40)
  await expect.poll(async () => (await dialog.boundingBox())!.y).toBeLessThan(before.y - 30)
  const moved = (await dialog.boundingBox())!
  await swipe(dialog.getByRole('button', { name: 'Resize chat height', exact: true }), 0, 50)
  await expect.poll(async () => (await dialog.boundingBox())!.height).toBeLessThan(moved.height - 40)
  expect(await page.evaluate(() => window.scrollX)).toBe(0)
})

test('multiline input and message actions work in the local preview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dev/chat-bubble')
  // This fixture also has the floating launcher; move it away from the separate
  // composer sample as an owner can do on any workspace page.
  await drag(page, page.getByRole('button', { name: 'Open chat assistant' }), -280, -550)
  await expect.poll(async () => (await page.getByRole('button', { name: 'Open chat assistant' }).boundingBox())!.y).toBeLessThan(200)
  const input = page.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('First part')
  await input.press('Enter')
  await input.pressSequentially('Second part')
  await expect(input).toHaveValue('First part\nSecond part')
  await input.press('Control+Enter')
  await expect(input).toHaveValue('')
  await expect(page.getByText('First part\nSecond part', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Simulate response' }).click()
  await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible()
  await page.getByRole('button', { name: 'Stop generating' }).click()
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible()
  expect(await page.locator('main').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
})
