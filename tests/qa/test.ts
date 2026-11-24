import { test as base, expect } from '@playwright/test'

/** Apply the same browser boundary to every QA journey, including new specs. */
export const test = base.extend({
  context: async ({ context, baseURL }, use, info) => {
    const blocked = new Set<string>()
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === baseURL || url.origin === 'https://prmqgcrnpuvpzruyzvuv.supabase.co') return route.continue()
      blocked.add(url.hostname)
      return route.abort('blockedbyclient')
    })
    await use(context)
    if (blocked.size) await info.attach('blocked-browser-hosts.json', {
      body: JSON.stringify({ hosts: [...blocked].sort(), actualExternalRequestsAllowed: false }), contentType: 'application/json',
    })
  },
})
export { expect }
