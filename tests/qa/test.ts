import { test as base, expect } from '@playwright/test'
import type { ConsoleMessage, Page, Request, Response, WebError } from '@playwright/test'
import { createBrowserFailureTracker } from './fixtures/browser-failures'

const STREAM_REVEAL_TIMEOUT_MS = 15_000

/**
 * React streaming SSR leaves the server-rendered copy of a Suspense boundary in a hidden
 * `<div hidden id="S:n">` for up to ~150 ms after load while the live copy is already in
 * place, so a locator can match two elements and fail strict mode. Real users never see
 * the hidden copy, so after a full-document navigation we wait until none is left.
 */
async function waitForStreamedSegmentsRevealed(page: Page, response: Response | null) {
  if (!response || page.isClosed()) return
  if (!(response.headers()['content-type'] ?? '').toLowerCase().includes('html')) return
  try {
    await page.waitForFunction(
      // Only segments holding real content can double-match a locator. A route that
      // calls notFound() after streaming began leaves an empty, template-only S:n
      // behind forever (React errors the boundary with $RX instead of revealing it).
      () => ![...document.querySelectorAll('div[hidden][id^="S:"]')].some(segment => segment.querySelector(':not(template)')),
      undefined,
      { timeout: STREAM_REVEAL_TIMEOUT_MS },
    )
  } catch (error) {
    if (page.isClosed()) return
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`streamed Suspense segment never revealed: ${page.url()}`)
    }
    throw error
  }
}

/** Apply the same browser boundary to every QA journey, including new specs. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page)
    const reload = page.reload.bind(page)
    page.goto = (async (...args: Parameters<Page['goto']>) => {
      const response = await goto(...args)
      await waitForStreamedSegmentsRevealed(page, response)
      return response
    }) as Page['goto']
    page.reload = (async (...args: Parameters<Page['reload']>) => {
      const response = await reload(...args)
      await waitForStreamedSegmentsRevealed(page, response)
      return response
    }) as Page['reload']
    await use(page)
  },
  context: async ({ context, baseURL }, use, info) => {
    if (!baseURL) throw new Error('The QA browser boundary requires the local app origin')
    const blocked = new Set<string>()
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === baseURL || url.origin === 'https://prmqgcrnpuvpzruyzvuv.supabase.co') return route.continue()
      blocked.add(url.hostname)
      return route.abort('blockedbyclient')
    })
    const failures = createBrowserFailureTracker(baseURL)
    const handlePageError = (webError: WebError) => failures.pageError(webError.error().message)
    const handleConsole = (message: ConsoleMessage) => {
      if (message.type() === 'error') failures.consoleError(message.text())
    }
    const handleResponse = (response: Response) => {
      const request = response.request()
      failures.assetResponse(response.url(), request.resourceType(), response.status())
    }
    const handleRequestFailed = (request: Request) => {
      failures.assetRequestFailed(request.url(), request.resourceType(), request.failure()?.errorText)
    }
    // The context emits these events for every page, including popups as they open.
    context.on('weberror', handlePageError)
    context.on('console', handleConsole)
    context.on('response', handleResponse)
    context.on('requestfailed', handleRequestFailed)
    try {
      await use(context)
    } finally {
      context.off('weberror', handlePageError)
      context.off('console', handleConsole)
      context.off('response', handleResponse)
      context.off('requestfailed', handleRequestFailed)
      if (blocked.size) await info.attach('blocked-browser-hosts.json', {
        body: JSON.stringify({ hosts: [...blocked].sort(), actualExternalRequestsAllowed: false }), contentType: 'application/json',
      })
      const summary = failures.summary()
      if (summary.events.length) await info.attach('browser-failures.json', {
        body: JSON.stringify(summary), contentType: 'application/json',
      })
      expect(summary.fatalCount, 'Unhandled browser exceptions or failed first-party scripts/stylesheets').toBe(0)
    }
  },
})
export { expect }
