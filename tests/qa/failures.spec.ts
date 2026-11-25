import type { Locator, Page, TestInfo } from '@playwright/test'
import { test, expect } from './test'
import { createQaFixture } from './fixtures/tenant'
import { drawSignatureStroke } from './fixtures/signature-canvas'
import { observeMicrophoneEvents } from './fixtures/media-events'

type Tenant = ReturnType<typeof createQaFixture>
const SIMULATED_PROVIDER = 'http://127.0.0.1:9651'
const REGENERATION_INPUT = 'Replace 20 linear feet of cedar rail, add two stainless brackets, and seal the wood. Labor is 400 dollars and materials are 600 dollars.'
type DenialDiagnostics = {
  installed: boolean
  calls: number
  phase: string
  userActivation: { isActive: boolean; hasBeenActive: boolean } | null
  errorName: string | null
}

async function withTenant(
  page: Page,
  baseURL: string,
  run: (fixture: Tenant) => Promise<void>,
  { captureStorage = false, beforeClose }: { captureStorage?: boolean; beforeClose?: (failed: boolean) => Promise<void> } = {},
) {
  const fixture = createQaFixture(baseURL, { captureStorage })
  let completed = false
  try {
    await fixture.seed()
    await run(fixture)
    completed = true
  } finally {
    try { await beforeClose?.(!completed) } finally {
      try { await page.close() } finally { await fixture.cleanup() }
    }
  }
}

function readCaptureDiagnostics(page: Page, expectedDescription: string | null = null) {
  return page.evaluate((expected) => {
    const microphone = document.querySelector<HTMLButtonElement>('[data-testid="capture-mic"]')
    const description = document.querySelector<HTMLTextAreaElement>('[data-testid="capture-description"]')
    const generate = document.querySelector<HTMLButtonElement>('[data-testid="generate-estimate-btn"]')
    return {
      fixture: (window as Window & { __qaDeniedMicrophone?: DenialDiagnostics }).__qaDeniedMicrophone ?? null,
      events: (window as Window & { __qaMicrophoneEvents?: unknown[] }).__qaMicrophoneEvents ?? [],
      documentReadyState: document.readyState,
      microphoneLabel: microphone?.getAttribute('aria-label') ?? null,
      microphoneDisabled: microphone?.disabled ?? null,
      descriptionLength: description?.value.length ?? null,
      descriptionMatchesFixture: description && expected !== null ? description.value === expected : null,
      generateDisabled: generate?.disabled ?? null,
    }
  }, expectedDescription).catch(() => null)
}

async function attachCaptureDiagnostics(page: Page, info: TestInfo, name: string, failed: boolean, observed: unknown, expectedDescription: string | null = null) {
  await info.attach(`${name}-diagnostics.json`, {
    body: JSON.stringify({ observed, beforePageClose: await readCaptureDiagnostics(page, expectedDescription) }),
    contentType: 'application/json',
  })
  if (failed) {
    const screenshot = await page.screenshot({ scale: 'css', timeout: 3_000 }).catch(() => null)
    if (screenshot) await info.attach(`${name}-before-cleanup.png`, { body: screenshot, contentType: 'image/png' })
  }
}

test('[QA:REGENERATION-OUTAGE] exhausted provider retries preserve the current estimate and offer manual recovery', async ({ page, baseURL }, info) => {
  test.setTimeout(300_000)
  let afterDescriptionFill: Awaited<ReturnType<typeof readCaptureDiagnostics>> = null
  await withTenant(page, baseURL!, async fixture => {
    const faultScope = { scope: fixture.projectName }
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
    await capture.getByTestId('capture-description').fill(REGENERATION_INPUT)
    afterDescriptionFill = await readCaptureDiagnostics(page, REGENERATION_INPUT)
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
      expect(recordings[0]).toMatchObject({ storage_path: null, transcript: REGENERATION_INPUT, duration_seconds: 0 })

      await failed.getByTestId('capture-edit-manually').click()
      await expect(page).toHaveURL(url => url.pathname === projectPath)
      await expect(page.getByRole('heading', { name: fixture.projectName, exact: true })).toBeVisible()
      expect(await fixture.readEstimate()).toMatchObject({ is_current: true, summary: fixture.summary, total: fixture.total })
    } finally {
      const cleared = await fault('DELETE')
      expect(cleared.ok).toBe(true)
    }
  }, {
    beforeClose: failed => attachCaptureDiagnostics(page, info, 'regeneration', failed, afterDescriptionFill, REGENERATION_INPUT),
  })
})

test('[QA:MICROPHONE-DENIED] microphone refusal leaves the estimate and capture storage intact', async ({ page, baseURL }, info) => {
  await observeMicrophoneEvents(page)
  let afterDenial: Awaited<ReturnType<typeof readCaptureDiagnostics>> = null
  await withTenant(page, baseURL!, async fixture => {
    await page.context().addCookies(fixture.cookies())
    // Simulate the platform refusing the microphone. The app still receives the
    // native error type from its normal browser API and handles the result.
    await page.addInitScript(() => {
      const diagnostics: DenialDiagnostics = {
        installed: false, calls: 0, phase: 'checking-media-devices', userActivation: null, errorName: null,
      }
      Object.assign(window, { __qaDeniedMicrophone: diagnostics })
      if (!navigator.mediaDevices) throw new Error('No browser mediaDevices API in the QA profile')
      Object.defineProperty(Object.getPrototypeOf(navigator.mediaDevices), 'getUserMedia', {
        configurable: true,
        value: async () => {
          diagnostics.calls++
          const activation = navigator.userActivation
          diagnostics.userActivation = activation ? { isActive: activation.isActive, hasBeenActive: activation.hasBeenActive } : null
          diagnostics.phase = 'throwing-permission-denial'
          diagnostics.errorName = 'NotAllowedError'
          throw new DOMException('QA denied microphone access', 'NotAllowedError')
        },
      })
      diagnostics.installed = true
      diagnostics.phase = 'installed'
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
    if (info.project.use.hasTouch) await mic.tap()
    else await mic.click()
    await expect(page.getByText('Microphone permission denied. Please allow microphone access and try again.', { exact: true })).toBeVisible()
    await expect(mic).toHaveAccessibleName('Start recording')
    await expect(mic).toBeEnabled()
    await expect(page.getByTestId('capture-timer')).toHaveText('00:00')
    afterDenial = await readCaptureDiagnostics(page)
    await page.getByTestId('skip-recording').click()
    await expect(page).toHaveURL(url => url.pathname === projectPath)
    await expect(page.getByRole('heading', { name: fixture.projectName, exact: true })).toBeVisible()

    expect(uploads).toEqual([])
    expect(await fixture.readCapture()).toEqual({ recordings: [], photos: [] })
    expect(await fixture.readEstimate()).toMatchObject({ version: 1, is_current: true, summary: fixture.summary, total: fixture.total })
    expect(await fixture.readOwn('estimate_items', fixture.itemId)).toMatchObject({ description: fixture.lineDescription })
  }, {
    captureStorage: true,
    beforeClose: failed => attachCaptureDiagnostics(page, info, 'microphone-denied', failed, afterDenial),
  })
})

async function drawSignature(page: Page, dialog: Locator) {
  await drawSignatureStroke(page, dialog.locator('canvas'))
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
