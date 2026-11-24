import type { BrowserContext, Locator, TestInfo } from '@playwright/test'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

test.use({ trace: 'off', video: 'off', screenshot: 'off' })

type Tenant = ReturnType<typeof createQaFixture>
type Surface = {
  route: string
  path?: string
  destination?: string
  heading: string
  verify: (main: Locator) => Promise<void>
}

async function visitSurfaces(context: BrowserContext, baseURL: string, info: TestInfo, surfaces: (tenant: Tenant) => Surface[]) {
  const tenant = createQaFixture(baseURL, { platformAdmin: true })
  const origin = new URL(baseURL).origin
  const visits: Array<{ route: string; status: number | null; ready: boolean; pageErrors: number; serverErrors: number }> = []
  try {
    await tenant.seed()
    await context.addCookies(tenant.cookies())
    for (const { route, path = route, destination = path, heading, verify } of surfaces(tenant)) {
      await test.step(`Read ${route}`, async () => {
        const screen = await context.newPage()
        const evidence = { route, status: null as number | null, ready: false, pageErrors: 0, serverErrors: 0 }
        visits.push(evidence)
        screen.on('pageerror', () => { evidence.pageErrors++ })
        screen.on('response', response => {
          if (new URL(response.url()).origin === origin && response.status() >= 500) evidence.serverErrors++
        })
        try {
          evidence.status = (await screen.goto(path, { waitUntil: 'load', timeout: 30_000 }))?.status() ?? null
          expect(evidence.status).toBe(200)
          await expect(screen).toHaveURL(new URL(destination, origin).href)
          await expect(screen.getByText(`Super Admin Mode - ${tenant.userEmail}`, { exact: true })).toBeVisible()
          const main = screen.getByRole('main')
          await expect(main.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
          await verify(main)
          evidence.ready = true
        } finally {
          await screen.close()
        }
        expect(evidence.pageErrors, `${route} unhandled browser exceptions`).toBe(0)
        expect(evidence.serverErrors, `${route} first-party HTTP 5xx responses`).toBe(0)
      })
    }
  } finally {
    try {
      await info.attach('admin-surface-evidence.json', {
        body: JSON.stringify({ visits }), contentType: 'application/json',
      })
    } finally {
      await tenant.cleanup()
    }
  }
}

async function verifyLegalPages(main: Locator) {
  await expect(main.getByRole('tab', { name: /^Privacy Policy(?: edited)?$/ })).toHaveAttribute('aria-selected', 'true')
  await expect(main.getByRole('tab', { name: /^Terms of Service(?: edited)?$/ })).toBeVisible()
  await expect(main.getByPlaceholder('Write content in Markdown format...', { exact: true })).toBeVisible()
}

test('[QA:ADM-CONTENT-SCREENS] administrative content editors and the design catalog render without saving', async ({ context, baseURL }, info) => {
  test.setTimeout(240_000)
  await visitSurfaces(context, baseURL!, info, () => [
    { route: '/admin/blog', heading: 'Blog posts', verify: async main => {
      await expect(main.getByRole('link', { name: 'New post', exact: true })).toHaveAttribute('href', '/admin/blog/new')
    } },
    { route: '/admin/blog/new', heading: 'New blog post', verify: async main => {
      await expect(main.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('')
      await expect(main.getByRole('textbox', { name: 'Content', exact: true })).toBeVisible()
    } },
    { route: '/admin/knowledge', heading: 'Industry knowledge base', verify: async main => {
      await expect(main.getByRole('link', { name: 'New entry', exact: true })).toHaveAttribute('href', '/admin/knowledge/new')
    } },
    { route: '/admin/knowledge/new', heading: 'New knowledge entry', verify: async main => {
      await expect(main.getByLabel('Industry', { exact: true })).toBeVisible()
      await expect(main.getByRole('textbox', { name: 'Body', exact: true })).toHaveValue('')
    } },
    { route: '/admin/branding', heading: 'Branding', verify: async main => {
      await expect(main.getByRole('textbox', { name: 'Application name', exact: true })).toBeVisible()
      await expect(main.getByRole('textbox', { name: 'Email sender name', exact: true })).toBeVisible()
    } },
    { route: '/admin/landing', heading: 'Landing Page Content', verify: async main => {
      await expect(main.getByRole('tab', { name: 'Hero', exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(main.getByRole('textbox', { name: 'Headline', exact: true })).toBeVisible()
    } },
    { route: '/admin/pages', heading: 'Pages', verify: verifyLegalPages },
    { route: '/admin/seo', heading: 'SEO Settings', verify: async main => {
      await expect(main.getByRole('textbox', { name: 'Site title', exact: true })).toBeVisible()
      await expect(main.getByRole('textbox', { name: 'Meta description', exact: true })).toBeVisible()
    } },
    { route: '/admin/design-system', heading: 'Design System', verify: async main => {
      await expect(main.getByRole('heading', { name: '1. Gradient Tokens', exact: true })).toBeVisible()
      await expect(main.getByRole('button', { name: 'Open dialog', exact: true })).toBeVisible()
    } },
  ])
})

test('[QA:ADM-OPERATIONS-SCREENS] administrative monitoring and provisioning screens render without actions', async ({ context, baseURL }, info) => {
  test.setTimeout(240_000)
  await visitSurfaces(context, baseURL!, info, tenant => {
    const company = new URLSearchParams({ companyId: tenant.companyId })
    const accountSearch = new URLSearchParams({ companyId: tenant.companyId, companySearch: tenant.companyName })
    return [
      { route: '/admin/academy', heading: 'Academy', verify: async main => {
        await expect(main.getByText('Dev fixtures active', { exact: true })).toBeVisible()
        const course = main.locator('section').filter({ has: main.page().getByRole('heading', { name: /^Getting started with Xtimator\b/ }) })
        await expect(course.getByRole('columnheader', { name: 'Opened', exact: true })).toBeVisible()
      } },
      { route: '/admin/billing', heading: 'Billing', verify: async main => {
        await expect(main.getByText('Platform AI Cost', { exact: true })).toBeVisible()
        await expect(main.getByRole('columnheader', { name: 'Company', exact: true })).toBeVisible()
      } },
      { route: '/admin/companies', path: `/admin/companies?${new URLSearchParams({ q: tenant.companyName })}`, heading: 'Companies', verify: async main => {
        const ownCompany = main.getByRole('row').filter({ has: main.page().getByText(tenant.companyName, { exact: true }) })
        await expect(ownCompany.getByRole('link', { name: 'Configure →', exact: true })).toHaveAttribute('href', `/admin/companies/${tenant.companyId}`)
      } },
      { route: '/admin/notifications', heading: 'Notification Center', verify: async main => {
        await expect(main.getByRole('tab', { name: 'Tenant', exact: true })).toHaveAttribute('aria-selected', 'true')
        await expect(main.getByRole('tab', { name: 'End Customer', exact: true })).toBeVisible()
      } },
      { route: '/admin/inbox', path: `/admin/inbox?${company}`, heading: 'Inbox', verify: async main => {
        await expect(main.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', `/admin/inbox/settings?${company}`)
        await expect(main.getByText('No conversations found.', { exact: true })).toBeVisible()
      } },
      { route: '/admin/inbox/settings', path: `/admin/inbox/settings?${accountSearch}`, heading: 'Inbox Settings', verify: async main => {
        await expect(main.getByRole('tab', { name: 'Accounts', exact: true })).toHaveAttribute('aria-selected', 'true')
        await expect(main.getByRole('combobox', { name: 'WhatsApp company', exact: true })).toHaveText(tenant.companyName)
        await expect(main.getByText('New accounts start pending review.', { exact: true })).toBeVisible()
      } },
      { route: '/admin/integrations/[slug]', path: '/admin/integrations/email', heading: 'Integrations', verify: async main => {
        await expect(main.locator('[data-slot="card-title"]').and(main.getByText('Resend', { exact: true }))).toBeVisible()
      } },
    ]
  })
})

test('[QA:ADM-LEGACY-ALIASES] administrative bookmarks redirect to the canonical screens', async ({ context, baseURL }, info) => {
  test.setTimeout(180_000)
  await visitSurfaces(context, baseURL!, info, () => [
    { route: '/admin/legal', destination: '/admin/pages', heading: 'Pages', verify: verifyLegalPages },
    { route: '/admin/whatsapp', destination: '/admin/inbox', heading: 'Inbox', verify: async main => {
      await expect(main.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', '/admin/inbox/settings')
      await expect(main.getByPlaceholder('Search...', { exact: true })).toBeVisible()
    } },
    { route: '/admin/whatsapp-templates', destination: '/admin/inbox/settings?tab=templates', heading: 'Inbox Settings', verify: async main => {
      await expect(main.getByRole('tab', { name: 'Templates', exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(main.getByRole('link', { name: 'Back to Inbox', exact: true })).toHaveAttribute('href', '/admin/inbox')
    } },
  ])
})
