import { test, expect } from './test'
import { createQaFixture } from './fixtures/tenant'

interface DescriptionEvent {
  kind: string
  inputType: string | null
  data: string | null
  field: number
  value: string
  selectionStart: number | null
  selectionEnd: number | null
}

type DiagnosticWindow = Window & { qaDescriptionEvents?: DescriptionEvent[] }

test('[QA:EDITOR-HYDRATION] desktop description is protected before hydration and replaces once after hydration', async ({ page, baseURL }, info) => {
  const fixture = createQaFixture(baseURL!)
  const origin = new URL(baseURL!).origin
  let heldScripts = 0
  let released = false
  let release!: () => void
  const scriptsReady = new Promise<void>((resolve) => { release = resolve })
  const releaseScripts = () => { released = true; release() }
  const description = page.getByPlaceholder('Item description', { exact: true })

  try {
    await fixture.seed()
    await page.context().addCookies(fixture.cookies())
    await page.addInitScript(() => {
      const events: DescriptionEvent[] = []
      const fields = new WeakMap<HTMLTextAreaElement, number>()
      let nextField = 0
      for (const kind of ['focusin', 'select', 'beforeinput', 'input', 'focusout']) {
        document.addEventListener(kind, (event) => {
          const element = event.target
          if (!(element instanceof HTMLTextAreaElement) || element.placeholder !== 'Item description' || events.length >= 24) return
          const field = fields.get(element) ?? ++nextField
          fields.set(element, field)
          events.push({
            kind,
            inputType: event instanceof InputEvent ? event.inputType : null,
            data: event instanceof InputEvent ? event.data : null,
            field,
            value: element.value,
            selectionStart: element.selectionStart,
            selectionEnd: element.selectionEnd,
          })
        }, true)
      }
      Object.defineProperty(window, 'qaDescriptionEvents', { value: events })
    })
    await page.route(url => url.origin === origin && url.pathname.startsWith('/_next/'), async route => {
      if (!released && route.request().resourceType() === 'script') {
        heldScripts++
        await scriptsReady
      }
      await route.fallback()
    })

    const serverField = await test.step('Observe the server-rendered field while app scripts are held', async () => {
      try {
        expect((await page.goto(`/projects/${fixture.projectId}`, { waitUntil: 'commit' }))?.status()).toBe(200)
        await expect.poll(() => heldScripts).toBeGreaterThan(0)
        await expect(description).toBeVisible()
        await expect(description).toHaveValue(fixture.lineDescription)
        await expect(page.getByTestId('editor-dock')).toHaveCount(0)
        return await description.evaluate((field: HTMLTextAreaElement) => ({
          disabled: field.disabled,
          readOnly: field.readOnly,
          connected: field.isConnected,
          initialValue: field.value,
        }))
      } finally {
        releaseScripts()
      }
    })

    await test.step('Repeat the original fill once after the editor has mounted', async () => {
      const dock = page.getByTestId('editor-dock')
      await expect(dock.getByRole('button', { name: 'Full width view', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(description).toBeEditable()
      await expect(description).toHaveValue(fixture.lineDescription)
      const replacement = 'Replace the railing with synthetic QA material'
      try {
        await description.fill(replacement)
      } finally {
        const events = await page.evaluate(() => (window as DiagnosticWindow).qaDescriptionEvents ?? [])
        await info.attach('editor-hydration-input.json', {
          body: JSON.stringify({ serverField, heldScripts, events }, null, 2),
          contentType: 'application/json',
        })
      }
      await expect(description).toHaveValue(replacement)
      const events = await page.evaluate(() => (window as DiagnosticWindow).qaDescriptionEvents ?? [])
      expect(events.find(event => event.kind === 'beforeinput')).toMatchObject({
        value: fixture.lineDescription, selectionStart: 0, selectionEnd: fixture.lineDescription.length,
      })
      expect(events.find(event => event.kind === 'input')).toMatchObject({ value: replacement })
      await description.press('Tab')
      await expect.poll(async () => (await fixture.readOwn('estimate_items', fixture.itemId))?.description).toBe(replacement)
    })

    expect.soft(serverField.disabled || serverField.readOnly, 'Server HTML must prevent edits until the client editor has mounted').toBe(true)
  } finally {
    releaseScripts()
    try { await page.close() } finally { await fixture.cleanup() }
  }
})
