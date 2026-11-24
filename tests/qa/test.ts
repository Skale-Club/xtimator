import { test as base, expect } from '@playwright/test'
import type { ConsoleMessage, Request, Response, WebError } from '@playwright/test'
import { createBrowserFailureTracker } from './fixtures/browser-failures'

/** Apply the same browser boundary to every QA journey, including new specs. */
export const test = base.extend({
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
