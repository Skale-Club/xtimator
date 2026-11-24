import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** Wait for the owning save's real RSC refresh before testing document reload. */
export async function completeServerRefresh(page: Page, pathname: string, save: () => Promise<unknown>) {
  const origin = new URL(page.url()).origin
  const [request] = await Promise.all([
    page.waitForRequest(request => {
      const url = new URL(request.url())
      return request.method() === 'GET' && request.headers().rsc === '1'
        && url.origin === origin && url.pathname === pathname
    }, { timeout: 20_000 }),
    save(),
  ])
  const response = await request.response()
  if (!response) throw new Error('The save refresh did not complete its response')
  expect(response.status()).toBe(200)
  await response.finished()
}
