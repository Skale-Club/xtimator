import type { Page, Response, TestInfo } from '@playwright/test'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

type Tenant = ReturnType<typeof createQaFixture>
const DESCRIPTION = 'Install 20 linear feet of cedar fence, including two posts and cleanup. Labor is 400 dollars and materials are 600 dollars.'
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

async function withTenant(page: Page, baseURL: string, work: (fixture: Tenant) => Promise<void>) {
  const fixture = createQaFixture(baseURL, { captureStorage: true })
  try {
    await fixture.seed()
    await page.context().addCookies(fixture.cookies())
    await work(fixture)
  } finally {
    try { await page.close() } finally { await fixture.cleanup() }
  }
}

async function expectGenerated(page: Page, fixture: Tenant, response: Response, inputType: 'manual_text' | 'photo', info: TestInfo) {
  expect(response.status()).toBe(202)
  const dispatch = response.request().postDataJSON()
  expect(dispatch).toMatchObject({ projectId: fixture.projectId, inputType, attemptId: expect.stringMatching(UUID) })
  const { jobId } = await response.json()
  expect(jobId).toMatch(/^[A-Z0-9]{26}$/)

  let evidence: Awaited<ReturnType<Tenant['readGenerationEvidence']>> | undefined
  try {
    await expect(page).toHaveURL(url => url.pathname === `/projects/${fixture.projectId}`
      && url.searchParams.get('tab') === 'estimate' && UUID.test(url.searchParams.get('estimate') ?? ''), { timeout: 150_000 })
    evidence = await fixture.readGenerationEvidence()
  } finally {
    const observed = evidence ?? await fixture.readGenerationEvidence().catch(() => null)
    const attemptEvents = observed?.events.filter(event => event.attempt_id === dispatch.attemptId)
    await info.attach('dedicated-generation-journal.json', {
      body: JSON.stringify({ inputType, jobId, attemptId: dispatch.attemptId,
        estimates: observed?.estimates.map(({ id, version, is_current, total }) => ({ id, version, is_current, total })) ?? null,
        events: attemptEvents?.map(({ step, status, input_type }) => ({ step, status, input_type })) ?? null }),
      contentType: 'application/json',
    })
    // Keep the original failure. Give a known in-flight synthetic worker a
    // bounded chance to finish before the fixture finally deletes its rows.
    const generationTerminal = ({ step, status }: { step: string; status: string }) =>
      step === 'generate_estimate' && (status === 'succeeded' || status === 'failed')
    if (!evidence && attemptEvents?.length && !attemptEvents.some(generationTerminal)) {
      await expect.poll(async () => (await fixture.readGenerationEvidence()).events
        .some(event => event.attempt_id === dispatch.attemptId && generationTerminal(event)), { timeout: 30_000 })
        .toBe(true).catch(() => undefined)
    }
  }
  if (!evidence) throw new Error('The generated estimate has no persisted completion evidence')
  const editorEstimateId = new URL(page.url()).searchParams.get('estimate')
  expect(evidence.estimates).toHaveLength(2)
  expect(evidence.estimates).toContainEqual(expect.objectContaining({ id: fixture.estimateId, version: 1, is_current: false }))
  const current = evidence.estimates.find(estimate => estimate.is_current)
  expect(current).toMatchObject({ id: editorEstimateId, version: 2, total: 1000 })
  expect(evidence.events).toContainEqual(expect.objectContaining({
    attempt_id: dispatch.attemptId, input_type: inputType, step: 'generate_estimate', status: 'succeeded',
  }))
  const estimate = await fixture.readEstimate(current!.id)
  expect(estimate).toMatchObject({ company_id: fixture.companyId, project_id: fixture.projectId, total: 1000 })
  expect(typeof estimate?.share_token).toBe('string')
  // Leave the protected client before removing its cookies to avoid a stale
  // AuthProvider redirect racing the new anonymous document navigation.
  await page.goto('about:blank')
  await page.context().clearCookies()
  expect((await page.goto(`/estimate/${estimate!.share_token}`))?.status()).toBe(200)
  await expect(page.getByText('Cedar fence boards and two posts', { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByText('Install fence and remove debris', { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByText('$1,000.00', { exact: true }).filter({ visible: true }).first()).toBeVisible()
}

test('[QA:DESCRIBE-GENERATE] a manual description produces the next persisted estimate through the dedicated text screen', async ({ page, baseURL }, info) => {
  test.setTimeout(300_000)
  await withTenant(page, baseURL!, async fixture => {
    expect((await page.goto(`/projects/${fixture.projectId}/describe`))?.status()).toBe(200)
    const description = page.getByRole('textbox', { name: 'Job Description', exact: true })
    const generate = page.getByRole('button', { name: 'Save & Generate Estimate', exact: true })
    await expect(generate).toBeDisabled()
    await description.fill(DESCRIPTION)
    await expect(description).toHaveValue(DESCRIPTION)
    await expect(generate).toBeEnabled()
    const [response] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === '/api/generate-estimate' && r.request().method() === 'POST'),
      generate.click(),
    ])
    await expectGenerated(page, fixture, response, 'manual_text', info)
    const { recordings, photos } = await fixture.readCapture()
    expect(recordings).toEqual([expect.objectContaining({ transcript: DESCRIPTION, storage_path: null, duration_seconds: 0 })])
    expect(photos).toEqual([])
    await info.attach('description-generation-evidence.json', {
      body: JSON.stringify({ inputType: 'manual_text', providerMode: 'synthetic', estimateVersions: 2, total: 1000 }), contentType: 'application/json',
    })
  })
})

test('[QA:PHOTOS-GENERATE] the photo-only screen requires an upload and generates the next persisted estimate', async ({ page, baseURL }, info) => {
  test.setTimeout(300_000)
  await withTenant(page, baseURL!, async fixture => {
    expect((await page.goto(`/projects/${fixture.projectId}/photos-input`))?.status()).toBe(200)
    const generate = page.getByRole('button', { name: 'Generate from Photos', exact: true })
    await expect(generate).toBeDisabled()
    expect((await fixture.readCapture()).photos).toEqual([])
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 128; canvas.height = 96
      const context = canvas.getContext('2d')!
      context.fillStyle = '#91b3cc'; context.fillRect(0, 0, 128, 96)
      context.fillStyle = '#9d6a45'; context.fillRect(20, 25, 8, 55); context.fillRect(100, 25, 8, 55)
      context.fillRect(24, 38, 80, 8); context.fillRect(24, 56, 80, 8)
      return canvas.toDataURL('image/png').split(',')[1]
    })
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Upload Photos', exact: true }).click(),
    ])
    await chooser.setFiles({ name: 'qa-fence-photo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
    await expect(generate).toBeEnabled({ timeout: 30_000 })
    const uploaded = (await fixture.readCapture()).photos
    expect(uploaded).toHaveLength(1)
    expect(uploaded[0].storage_path).toMatch(new RegExp(`^${fixture.companyId}/${fixture.projectId}/[\\da-f-]+\\.webp$`, 'i'))
    const [response] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === '/api/generate-estimate' && r.request().method() === 'POST'),
      generate.click(),
    ])
    await expectGenerated(page, fixture, response, 'photo', info)
    const { recordings, photos } = await fixture.readCapture()
    expect(recordings).toEqual([])
    expect(photos).toEqual([expect.objectContaining({ id: uploaded[0].id, ai_description: 'Cedar fence location on level ground' })])
    await info.attach('photo-generation-evidence.json', {
      body: JSON.stringify({ inputType: 'photo', providerMode: 'synthetic', physicalCamera: false, estimateVersions: 2, total: 1000 }), contentType: 'application/json',
    })
  })
})
