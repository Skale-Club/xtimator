import type { Locator, Page } from '@playwright/test'
import { test, expect } from './test'
import { createQaFixture } from './fixtures/tenant'

type Tenant = ReturnType<typeof createQaFixture>
const SIMULATED_PROVIDER = 'http://127.0.0.1:9651'

async function withTenant(page: Page, baseURL: string, run: (fixture: Tenant) => Promise<void>, captureStorage = false) {
  const fixture = createQaFixture(baseURL, { captureStorage })
  try {
    await fixture.seed()
    await run(fixture)
  } finally {
    try { await page.close() } finally { await fixture.cleanup() }
  }
}

test('[QA:REGENERATION-OUTAGE] exhausted provider retries preserve the current estimate and offer manual recovery', async ({ page, baseURL }) => {
  test.setTimeout(300_000)
  await withTenant(page, baseURL!, async fixture => {
    const faultScope = { scope: fixture.projectName }
    const description = 'Replace 20 linear feet of cedar rail, add two stainless brackets, and seal the wood. Labor is 400 dollars and materials are 600 dollars.'
    const projectPath = `/projects/${fixture.projectId}`
    const fault = (method: 'POST' | 'DELETE') => fetch(`${SIMULATED_PROVIDER}/fault`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(method === 'POST' ? { ...faultScope, attempts: 3 } : faultScope),
      signal: AbortSignal.timeout(8_000),
    })

    await page.context().addCookies(fixture.cookies())
    expect((await page.goto(`${projectPath}/capture`))?.status()).toBe(200)
    const capture = page.getByTestId('capture-screen')
    await capture.getByTestId('capture-description').fill(description)
    const generate = capture.getByTestId('generate-estimate-btn')
    await expect(generate).toBeEnabled()
    expect(await fixture.readEstimate()).toMatchObject({ version: 1, is_current: true, summary: fixture.summary })

    try {
      const configured = await fault('POST')
      expect(configured.ok).toBe(true)
      await generate.click()
      const failed = capture.getByTestId('capture-failure')
      await expect(failed.getByText('Could not generate the estimate', { exact: true })).toBeVisible({ timeout: 240_000 })
      await expect(failed.getByText('provider_unavailable', { exact: true })).toBeVisible()
      await expect(failed.getByTestId('capture-retry')).toHaveText('Retry')
      await expect(failed.getByTestId('capture-retry')).toBeEnabled()

      const history = await fetch(`${SIMULATED_PROVIDER}/history`, { signal: AbortSignal.timeout(8_000) })
      expect(history.status).toBe(200)
      const calls: { kind: string; tool?: string; scope?: string }[] = await history.json()
      expect(calls.filter(call => call.kind === 'controlled-outage' && call.tool === 'create_estimate' && call.scope === faultScope.scope)).toHaveLength(3)

      const { events, estimates } = await fixture.readGenerationEvidence()
      const terminal = events.filter(event => event.step === 'generate_estimate' && event.status === 'failed')
      expect(terminal).toHaveLength(1)
      expect(terminal[0]).toMatchObject({ input_type: 'manual_text', error_message: 'provider_unavailable' })
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ attempt_id: terminal[0].attempt_id, step: 'generate_estimate', status: 'started' }),
      ]))
      expect(estimates).toEqual([{ id: fixture.estimateId, version: 1, is_current: true, summary: fixture.summary, total: fixture.total }])
      expect(await fixture.readOwn('estimate_items', fixture.itemId)).toMatchObject({ description: fixture.lineDescription })
      const { recordings } = await fixture.readCapture()
      expect(recordings).toHaveLength(1)
      expect(recordings[0]).toMatchObject({ storage_path: null, transcript: description, duration_seconds: 0 })

      await failed.getByTestId('capture-edit-manually').click()
      await expect(page).toHaveURL(url => url.pathname === projectPath)
      await expect(page.getByRole('heading', { name: fixture.projectName, exact: true })).toBeVisible()
      expect(await fixture.readEstimate()).toMatchObject({ is_current: true, summary: fixture.summary, total: fixture.total })
    } finally {
      const cleared = await fault('DELETE')
      expect(cleared.ok).toBe(true)
    }
  })
})

test('[QA:MICROPHONE-DENIED] microphone refusal leaves the estimate and capture storage intact', async ({ page, baseURL }) => {
  await withTenant(page, baseURL!, async fixture => {
    await page.context().addCookies(fixture.cookies())
    // Simulate the platform refusing the microphone. The app still receives the
    // native error type from its normal browser API and handles the result.
    await page.addInitScript(() => {
      if (!navigator.mediaDevices) throw new Error('No browser mediaDevices API in the QA profile')
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => { throw new DOMException('QA denied microphone access', 'NotAllowedError') },
      })
    })
    const uploads: string[] = []
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (path === '/api/storage/upload-ticket' || path.startsWith('/storage/v1/object/upload/sign/audio/')) uploads.push(path)
    })
    const projectPath = `/projects/${fixture.projectId}`
    expect((await page.goto(`${projectPath}/capture`))?.status()).toBe(200)
    const mic = page.getByTestId('capture-mic')
    await expect(mic).toHaveAccessibleName('Start recording')
    await mic.click()
    await expect(page.getByText('Microphone permission denied. Please allow microphone access and try again.', { exact: true })).toBeVisible()
    await expect(mic).toHaveAccessibleName('Start recording')
    await expect(mic).toBeEnabled()
    await expect(page.getByTestId('capture-timer')).toHaveText('00:00')
    await page.getByTestId('skip-recording').click()
    await expect(page).toHaveURL(url => url.pathname === projectPath)
    await expect(page.getByRole('heading', { name: fixture.projectName, exact: true })).toBeVisible()

    expect(uploads).toEqual([])
    expect(await fixture.readCapture()).toEqual({ recordings: [], photos: [] })
    expect(await fixture.readEstimate()).toMatchObject({ version: 1, is_current: true, summary: fixture.summary, total: fixture.total })
    expect(await fixture.readOwn('estimate_items', fixture.itemId)).toMatchObject({ description: fixture.lineDescription })
  }, true)
})

async function drawSignature(page: Page, dialog: Locator) {
  const canvas = dialog.locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Signature canvas is not visible')
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.62)
  await page.mouse.down()
  for (const [x, y] of [[0.32, 0.27], [0.48, 0.7], [0.67, 0.34], [0.84, 0.58]]) {
    await page.mouse.move(box.x + x * box.width, box.y + y * box.height, { steps: 3 })
  }
  await page.mouse.up()
}

test('[QA:STALE-SIGNATURE] a concurrent estimate edit rejects the stale public signature', async ({ page, baseURL }, info) => {
  await withTenant(page, baseURL!, async fixture => {
    const original = await fixture.readEstimate()
    expect(original).toMatchObject({ is_current: true, client_response: null })
    expect(await fixture.readSignature()).toBeNull()
    expect((await page.goto(`/estimate/${fixture.shareToken}`))?.status()).toBe(200)
    await expect(page.getByText(fixture.lineDescription, { exact: true }).filter({ visible: true })).toBeVisible()

    const accept = info.project.name === 'chromium'
      ? page.getByTestId('proposal-bar').getByRole('button', { name: 'Accept', exact: true })
      : page.getByTestId('mobile-accept-bar').getByRole('button', { name: 'Accept Estimate', exact: true })
    await accept.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Your full name').fill('QA Stale Document Signer')
    await drawSignature(page, dialog)
    const submit = dialog.getByRole('button', { name: 'Sign & Accept Estimate', exact: true })
    await expect(submit).toBeEnabled()

    const revisedDescription = 'Install a new cedar railing with steel brackets'
    await fixture.reviseOwnEstimateLine(revisedDescription)
    const revised = await fixture.readEstimate()
    expect(Date.parse(revised?.updated_at)).toBeGreaterThan(Date.parse(original?.updated_at))
    expect(await fixture.readOwn('estimate_items', fixture.itemId)).toMatchObject({ description: revisedDescription })

    const path = `/api/estimates/${fixture.estimateId}/sign`
    const [response] = await Promise.all([
      page.waitForResponse(item => new URL(item.url()).pathname === path && item.request().method() === 'POST'),
      submit.click(),
    ])
    expect(response.status()).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'estimate_updated' })
    const { contentVersion, contentFingerprint } = response.request().postDataJSON()
    expect(Date.parse(contentVersion)).toBe(Date.parse(original?.updated_at))
    expect(contentFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(await fixture.readSignature()).toBeNull()
    expect(await fixture.readEstimate()).toMatchObject({ id: fixture.estimateId, is_current: true, client_response: null })
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('response-status')).toHaveCount(0)

    const notice = page.getByTestId('estimate-updated-notice')
    await expect(notice).toContainText('This estimate was just updated. Review the latest version before signing.')
    await notice.getByRole('button', { name: 'Load latest version', exact: true }).click()
    await expect(page.getByText(revisedDescription, { exact: true }).filter({ visible: true })).toBeVisible()
    await expect(notice).toHaveCount(0)
    await expect(accept).toBeEnabled()
  })
})
