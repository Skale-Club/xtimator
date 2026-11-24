import { execFileSync } from 'node:child_process'
import type { Page } from '@playwright/test'
import { expect, test } from './test'
import { createQaFixture } from './fixtures/tenant'

const SIMULATED_PROVIDER = 'http://127.0.0.1:9651'
const TRANSCRIPT = 'Install 20 linear feet of cedar fence, including two posts and cleanup. Labor is 400 dollars and materials are 600 dollars.'
const ESTIMATE_SUMMARY = 'Install 20 linear feet of cedar fence with two posts and job-site cleanup.'
const ESTIMATE_LINES = ['Cedar fence boards and two posts', 'Install fence and remove debris']
const PHOTO_DESCRIPTION = 'Cedar fence location on level ground'
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

type ProviderCall = { kind: string; tool?: string | null }

async function providerHistory(page: Page): Promise<ProviderCall[]> {
  const response = await page.request.get(`${SIMULATED_PROVIDER}/history`, { timeout: 8_000 })
  expect(response.status()).toBe(200)
  const calls: ProviderCall[] = await response.json()
  return calls.map(({ kind, tool }) => ({ kind, tool }))
}

async function installSyntheticMicrophone(page: Page) {
  await page.addInitScript(() => {
    if (!navigator.mediaDevices) return
    // Supply synthetic PCM as a native browser MediaStream. The product still
    // owns the MediaRecorder, container choice, timing, upload and dispatch.
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        if (!constraints.audio || constraints.video) throw new DOMException('QA microphone supports audio only', 'NotAllowedError')
        const audio = new AudioContext()
        const destination = audio.createMediaStreamDestination()
        const oscillator = audio.createOscillator()
        const gain = audio.createGain()
        oscillator.frequency.value = 440
        gain.gain.value = 0.05
        oscillator.connect(gain)
        gain.connect(destination)
        oscillator.start()
        const [track] = destination.stream.getAudioTracks()
        const stop = track.stop.bind(track)
        Object.defineProperty(track, 'stop', {
          value: () => {
            if (track.readyState === 'ended') return
            stop()
            oscillator.stop()
            void audio.close().catch(() => undefined)
          },
        })
        if (audio.state === 'suspended') await audio.resume()
        return destination.stream
      },
    })
  })
}

async function uploadSyntheticPhoto(page: Page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 96
    const painter = canvas.getContext('2d')!
    painter.fillStyle = '#cbe6ff'
    painter.fillRect(0, 0, 128, 96)
    painter.fillStyle = '#6b8055'
    painter.fillRect(0, 65, 128, 31)
    painter.fillStyle = '#9d6a45'
    painter.fillRect(20, 25, 8, 55)
    painter.fillRect(100, 25, 8, 55)
    painter.fillRect(24, 38, 80, 8)
    painter.fillRect(24, 56, 80, 8)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const button = page.getByTestId('capture-add-photos')
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15_000 }), button.click()])
  await chooser.setFiles({ name: 'qa-synthetic-fence.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(button).toHaveText(/^1 photos?$/i, { timeout: 30_000 })
}

test('[QA:CAPTURE-PIPELINE] synthetic microphone and photo produce a persisted estimate through the app and Inngest', async ({ page, baseURL }, info) => {
  test.setTimeout(300_000)
  const fixture = createQaFixture(baseURL!, { captureStorage: true })
  const objectDirectory = `${fixture.companyId}/${fixture.projectId}/`
  const projectPath = `/projects/${fixture.projectId}`

  try {
    await fixture.seed()
    await page.context().addCookies(fixture.cookies())
    await installSyntheticMicrophone(page)
    const initialProviderCalls = await providerHistory(page)
    const provider = await page.request.get(`${SIMULATED_PROVIDER}/health`, { timeout: 8_000 })
    expect(provider.status()).toBe(200)
    expect(await provider.json()).toMatchObject({ mode: 'synthetic', realProviderCalls: 0 })
    expect(await fixture.readEstimate()).toMatchObject({ version: 1, is_current: true })

    await test.step('Open the capture screen and upload a synthetic photo', async () => {
      expect((await page.goto(`${projectPath}/capture`))?.status()).toBe(200)
      await expect(page.getByTestId('capture-screen')).toBeVisible()
      await uploadSyntheticPhoto(page)
      const { photos } = await fixture.readCapture()
      expect(photos).toHaveLength(1)
      expect(photos[0].storage_path).toMatch(/\.webp$/)
      expect(photos[0].storage_path.startsWith(objectDirectory)).toBe(true)
      expect(photos[0].ai_description).toBeNull()
    })

    const uploadedKey = await test.step('Record a synthetic microphone stream and observe the real audio upload', async () => {
      const microphone = page.getByTestId('capture-mic')
      await expect(microphone).toHaveAccessibleName('Start recording')
      await microphone.click()
      await expect(microphone).toHaveAccessibleName('Stop recording')
      await expect(page.getByTestId('capture-timer')).toHaveText(/^(?!00:0[01]$)\d{2}:\d{2}$/, { timeout: 15_000 })

      const uploadPromise = page.waitForResponse(response => new URL(response.url()).pathname
        .startsWith(`/storage/v1/object/upload/sign/audio/${objectDirectory}`)
        && response.request().method() === 'PUT', { timeout: 45_000 }).catch(() => null)
      const [ticket] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === '/api/storage/upload-ticket'
          && response.request().method() === 'POST', { timeout: 30_000 }),
        microphone.click(),
      ])
      expect(ticket.status()).toBe(200)
      const request = ticket.request().postDataJSON()
      expect(request).toMatchObject({ bucket: 'audio', projectId: fixture.projectId })
      expect(request.size).toBeGreaterThan(0)
      const { key, strategy } = await ticket.json()
      expect(strategy).toBe('supabase-signed-upload')
      expect(typeof key === 'string' && key.startsWith(objectDirectory)).toBe(true)
      const upload = await uploadPromise
      if (!upload) throw new Error('The browser did not complete the signed audio upload')
      expect(upload.ok()).toBe(true)
      expect(new URL(upload.url()).pathname.endsWith(`/audio/${key}`)).toBe(true)
      return key as string
    })

    const generated = await test.step('Wait for the estimate editor and check committed pipeline results', async () => {
      await expect(page).toHaveURL(url => url.pathname === projectPath && url.searchParams.get('tab') === 'estimate'
        && UUID.test(url.searchParams.get('estimate') ?? ''), { timeout: 140_000 })
      const estimateId = new URL(page.url()).searchParams.get('estimate')!
      expect(estimateId).not.toBe(fixture.estimateId)
      const estimate = await fixture.readEstimate(estimateId)
      expect(estimate).toMatchObject({ project_id: fixture.projectId, version: 2, is_current: true, status: 'draft', summary: ESTIMATE_SUMMARY })
      expect(Number(estimate?.subtotal)).toBe(1000)
      expect(Number(estimate?.total)).toBe(1000)
      expect(await fixture.readEstimate()).toMatchObject({ version: 1, is_current: false })
      const shareToken = estimate?.share_token
      if (typeof shareToken !== 'string' || !UUID.test(shareToken)) throw new Error('The generated estimate has no valid share token')

      const { recordings, photos } = await fixture.readCapture()
      expect(recordings).toHaveLength(1)
      expect(recordings[0]).toMatchObject({ storage_path: uploadedKey, transcript: TRANSCRIPT })
      expect(Number(recordings[0].duration_seconds)).toBeGreaterThan(0)
      expect(photos).toHaveLength(1)
      expect(photos[0].ai_description).toBe(PHOTO_DESCRIPTION)

      if (info.project.name === 'chromium') {
        const fields = page.getByPlaceholder('Item description', { exact: true })
        await expect.poll(() => fields.evaluateAll(elements => elements.map(element => (element as HTMLTextAreaElement).value)))
          .toEqual(expect.arrayContaining(ESTIMATE_LINES))
      } else {
        for (const line of ESTIMATE_LINES) await expect(page.getByText(line, { exact: true }).first()).toBeVisible()
      }
      const calls = (await providerHistory(page)).slice(initialProviderCalls.length)
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'transcription' }),
        expect.objectContaining({ kind: 'chat', tool: 'create_estimate' }),
      ]))
      await info.attach('synthetic-capture-evidence.json', {
        body: JSON.stringify({ media: ['Web Audio tone', 'Canvas PNG'], providerMode: 'synthetic', providerCalls: calls, estimateVersion: estimate?.version }),
        contentType: 'application/json',
      })
      return { id: estimateId, shareToken }
    })

    await test.step('Render the generated estimate as a PDF and in the anonymous document', async () => {
      const response = await page.request.get(`/api/estimates/${generated.id}/pdf`, { timeout: 30_000 })
      expect(response.status()).toBe(200)
      const pdf = await response.body()
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
      const pdfText = execFileSync(process.env.QA_PYTHON || 'python', ['-c',
        'import sys,io;from pypdf import PdfReader;print(" ".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages))'],
      { input: pdf, encoding: 'utf8', timeout: 15_000 }).replace(/\s+/g, ' ')
      for (const line of ESTIMATE_LINES) expect(pdfText).toContain(line)
      expect(pdfText).toContain('1,000.00')
      await info.attach('generated-estimate.pdf', { body: pdf, contentType: 'application/pdf' })

      await page.context().clearCookies()
      expect((await page.goto(`/estimate/${generated.shareToken}`))?.status()).toBe(200)
      for (const line of ESTIMATE_LINES) await expect(page.getByText(line, { exact: true }).filter({ visible: true })).toBeVisible()
      await expect(page.getByText('$1,000.00', { exact: true }).filter({ visible: true }).first()).toBeVisible()
      await info.attach('generated-public-estimate.png', { body: await page.screenshot(), contentType: 'image/png' })
    })
  } finally {
    // Cancel in-flight browser requests before revoking the session and removing
    // any exact-prefix storage objects created by a partial capture.
    try { await page.close() } finally { await fixture.cleanup() }
  }
})
