import { randomUUID } from 'node:crypto'
import type { APIRequestContext } from '@playwright/test'
import { createQaFixture } from './fixtures/tenant'
import manifest from './manifest.json'
import { expect, test } from './test'

test.use({ trace: 'off', video: 'off', screenshot: 'off' })

function isSameOriginLogout(value: string | undefined, origin: string) {
  if (!value) return false
  try {
    const url = new URL(value, origin)
    return url.href === `${origin}/api/logout` && !url.username && !url.password
  } catch {
    return false
  }
}

function streamedLogout(html: string, origin: string) {
  // Next can emit a streaming HTML redirect after committing the HTTP status.
  const tags = html.matchAll(/<meta\b[^>]*\bid="__next-page-redirect"[^>]*>/gi)
  for (const [tag] of tags) {
    const target = tag.match(/\bcontent="1;url=([^"]+)"/i)?.[1]
    if (/\bhttp-equiv="refresh"/i.test(tag) && isSameOriginLogout(target, origin)) return 'streamed-meta'
  }
  const digests = html.matchAll(/NEXT_REDIRECT;(?:push|replace);([^;]+);307;/g)
  for (const [, target] of digests) {
    if (isSameOriginLogout(target, origin)) return 'streamed-next-redirect'
  }
  return 'missing-logout'
}

async function readAdminBoundary(request: APIRequestContext, pathname: string, origin: string) {
  const response = await request.get(pathname, { maxRedirects: 0, timeout: 15_000 })
  try {
    const status = response.status()
    const isHtml = response.headers()['content-type']?.startsWith('text/html') ?? false
    const html = isHtml ? await response.text() : ''
    const protectedShell = /\bdata-theme="admin-dark"/.test(html)
    if (status === 307) {
      return { status, classification: isSameOriginLogout(response.headers().location, origin)
        ? 'http-logout' : 'wrong-redirect', protectedShell }
    }
    if (status !== 200) return { status, classification: 'unexpected-status', protectedShell }
    return { status, classification: isHtml ? streamedLogout(html, origin) : 'unexpected-content', protectedShell }
  } finally {
    await response.dispose()
  }
}

async function hasSyntheticSession(request: APIRequestContext, userId: string) {
  const response = await request.get('/api/auth/session', { maxRedirects: 0, timeout: 10_000 }).catch(() => null)
  if (!response) return false
  try {
    return response.status() === 200 && (await response.json())?.user?.id === userId
  } catch {
    return false
  } finally {
    await response.dispose()
  }
}

test('[QA:ADMIN-ROUTE-DENIAL] an authenticated tenant receives only the admin logout boundary', async ({ context, baseURL }, info) => {
  test.setTimeout(330_000)
  const tenant = createQaFixture(baseURL!)
  const origin = new URL(baseURL!).origin
  const routePatterns = manifest.scenarios.find(scenario => scenario.id === 'ADMIN-ROUTE-DENIAL')?.routes
  if (!routePatterns?.length) throw new Error('The manifest must enumerate the admin request boundary routes')
  const syntheticPaths: Record<string, string> = {
    '/admin/academy/[userId]': `/admin/academy/${tenant.userId}`,
    '/admin/blog/[id]': `/admin/blog/${randomUUID()}`,
    '/admin/companies/[id]': `/admin/companies/${tenant.companyId}`,
    '/admin/events/[attemptId]': `/admin/events/${randomUUID()}`,
    '/admin/integrations/[slug]': '/admin/integrations/ai',
    '/admin/knowledge/[id]': `/admin/knowledge/${randomUUID()}`,
  }
  const observations: Array<{ route: string; status: number | null; classification: string; protectedShell: boolean }> = []
  let sessionKept = false
  try {
    await tenant.seed()
    await context.addCookies(tenant.cookies())
    for (const route of routePatterns) {
      await test.step(`Request ${route} as a tenant`, async () => {
        expect(await hasSyntheticSession(context.request, tenant.userId), 'Each request needs an authenticated tenant').toBe(true)
        const pathname = syntheticPaths[route] ?? route
        expect(!pathname.includes('[') && pathname.startsWith('/admin'), 'Each scoped route needs a concrete admin path').toBe(true)
        const result = await readAdminBoundary(context.request, pathname, origin).catch(() => (
          { status: null, classification: 'transport-error', protectedShell: false }
        ))
        observations.push({ route, ...result })
        expect.soft(['http-logout', 'streamed-meta', 'streamed-next-redirect'], route).toContain(result.classification)
        expect.soft(result.protectedShell, route).toBe(false)
      })
    }
    sessionKept = await hasSyntheticSession(context.request, tenant.userId)
    expect(sessionKept, 'An unfollowed redirect must leave the tenant session active').toBe(true)
  } finally {
    try {
      await info.attach('admin-route-denial.json', {
        body: JSON.stringify({ scope: 'unfollowed document requests', expectedRoutes: routePatterns.length,
          requestedRoutes: observations.length, sessionKept, observations }),
        contentType: 'application/json',
      })
    } finally {
      await tenant.cleanup()
    }
  }
})
