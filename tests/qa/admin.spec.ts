import type { Page, TestInfo } from '@playwright/test'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

// Admin pages can render other development users and integration metadata.
// Retain sanitized assertions and status evidence instead of DOM snapshots.
test.use({ trace: 'off', video: 'off', screenshot: 'off' })

type Tenant = ReturnType<typeof createQaFixture>
type AdminSurface = {
  route: string
  path?: string
  heading: string
  verify: (page: Page) => Promise<void>
}

async function withTenant(page: Page, baseURL: string, platformAdmin: boolean, run: (tenant: Tenant) => Promise<void>) {
  const tenant = createQaFixture(baseURL, { platformAdmin })
  try {
    await tenant.seed()
    await page.context().addCookies(tenant.cookies())
    await run(tenant)
  } finally {
    try { await page.close() } finally { await tenant.cleanup() }
  }
}

test('[QA:ADM-DENIAL] an authenticated tenant cannot read the admin UI or admin API', async ({ page, baseURL }, info) => {
  await withTenant(page, baseURL!, false, async tenant => {
    const browserErrors: string[] = []
    page.on('pageerror', error => browserErrors.push(
      /Rendered (?:more|fewer) hooks/i.test(error.message) ? 'router-hooks'
        : /hydration|hydrating/i.test(error.message) ? 'hydration'
          : /firebase|identity|auth\//i.test(error.message) ? 'identity' : 'other',
    ))
    const session = await page.request.get('/api/auth/session', { maxRedirects: 0 })
    expect(session.status()).toBe(200)
    expect((await session.json()).user?.id).toBe(tenant.userId)

    // The real route checks the current platform admin role before it loads
    // configuration or contacts a provider. Exercise only the denied request.
    const api = await page.request.get('/api/admin/openrouter-models', { maxRedirects: 0 })
    expect(api.status()).toBe(401)
    const denial = await api.json()
    expect(denial?.error === 'Unauthorized' && Object.keys(denial).length === 1).toBe(true)

    const [logout] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/logout'
        && response.request().method() === 'GET', { timeout: 25_000 }),
      page.goto('/admin', { waitUntil: 'commit' }),
    ])
    expect(logout.status()).toBe(307)
    expect(new URL(logout.headers().location, baseURL).pathname).toBe('/')
    expect(new URL(logout.headers().location, baseURL).searchParams.get('auth')).toBe('login')
    const revoked = await page.request.get('/api/auth/session', { maxRedirects: 0 })
    expect(revoked.status()).toBe(200)
    expect((await revoked.json()).user).toBeNull()
    try {
      await expect(page.getByRole('dialog', { name: /^Sign in to / })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Platform admin navigation' })).toHaveCount(0)
      expect(browserErrors).toEqual([])
    } finally {
      await info.attach('admin-denial-evidence.json', {
        body: JSON.stringify({ authenticatedBeforeDenial: true, adminApiStatus: api.status(), logoutStatus: logout.status(), sessionCleared: true,
          finalPath: new URL(page.url()).pathname, browserErrors,
          loginDialogs: await page.getByRole('dialog', { name: /^Sign in to / }).count(),
          phoneFields: await page.getByLabel('Phone number', { exact: true }).count(),
          landingVisible: await page.getByTestId('landing-shell').isVisible(),
        }), contentType: 'application/json',
      })
    }
  })
})

test('[QA:ADM-READONLY] a marked DEV platform admin can read the admin screens without taking privileged actions', async ({ page, baseURL }, info) => {
  test.setTimeout(240_000)
  await withTenant(page, baseURL!, true, async tenant => {
    const surfaces: AdminSurface[] = [
      { route: '/admin', heading: 'Dashboard', verify: async screen => {
        await expect(screen.getByText('Registered companies', { exact: true })).toBeVisible()
        await expect(screen.getByText('Estimates (30 days)', { exact: true })).toBeVisible()
      } },
      { route: '/admin/admins', heading: 'Platform admins', verify: async screen => {
        const ownRow = screen.getByRole('row').filter({ has: screen.getByText(tenant.userEmail, { exact: true }) })
        await expect(ownRow.getByText('You', { exact: true })).toBeVisible()
        await expect(screen.getByRole('button', { name: 'Add admin', exact: true })).toBeVisible()
      } },
      { route: '/admin/companies/[id]', path: `/admin/companies/${tenant.companyId}`, heading: tenant.companyName, verify: async screen => {
        await expect(screen.getByRole('heading', { name: 'Client features', exact: true })).toBeVisible()
        await expect(screen.getByRole('switch', { name: 'Allow digital signature', exact: true })).toBeChecked()
        await expect(screen.getByRole('switch', { name: 'Allow online payments', exact: true })).not.toBeChecked()
      } },
      { route: '/admin/events', path: `/admin/events?q=${tenant.projectId}`, heading: 'Event Log', verify: async screen => {
        await expect(screen.getByPlaceholder('Search by user, project, estimate, attempt ID, or error…', { exact: true })).toHaveValue(tenant.projectId)
        await expect(screen.getByText('No attempts match your filters', { exact: true })).toBeVisible()
      } },
      { route: '/admin/integrations', heading: 'Integrations', verify: async screen => {
        const category = info.project.name === 'chromium'
          ? screen.getByRole('link', { name: 'AI', exact: true })
          : screen.getByRole('button', { name: 'Integration categories: AI', exact: true })
        await expect(category).toBeVisible()
        await expect(screen.getByText('OpenRouter', { exact: true }).and(screen.locator('[data-slot="card-title"]'))).toBeVisible()
      } },
    ]

    const visits: Array<{ route: string; status: number | null; ready: boolean; pageErrors: number; serverErrors: number }> = []
    try {
      for (const { route, path = route, heading, verify } of surfaces) {
        await test.step(`Read ${route}`, async () => {
          const screen = await page.context().newPage()
          const evidence = { route, status: null as number | null, ready: false, pageErrors: 0, serverErrors: 0 }
          visits.push(evidence)
          screen.on('pageerror', () => { evidence.pageErrors++ })
          screen.on('response', response => {
            if (new URL(response.url()).origin === baseURL && response.status() >= 500) evidence.serverErrors++
          })
          try {
            evidence.status = (await screen.goto(path, { waitUntil: 'load', timeout: 30_000 }))?.status() ?? null
            expect(evidence.status).toBe(200)
            await expect(screen).toHaveURL(new URL(path, baseURL).href)
            await expect(screen.getByText(`Super Admin Mode - ${tenant.userEmail}`, { exact: true })).toBeVisible()
            await expect(screen.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
            await verify(screen)
            evidence.ready = true
          } finally {
            await screen.close()
          }
          expect(evidence.pageErrors, `${route} uncaught browser exceptions`).toBe(0)
          expect(evidence.serverErrors, `${route} first-party server errors`).toBe(0)
        })
      }
    } finally {
      await info.attach('admin-readonly-evidence.json', {
        body: JSON.stringify({ visits, readOnly: true, capturedAdminContent: false }),
        contentType: 'application/json',
      })
    }
  })
})
