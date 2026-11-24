import type { Locator, Page, TestInfo } from '@playwright/test'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

type Surface = {
  path: string
  destination?: string
  verify: (page: Page) => Promise<void>
}

async function visible(locator: Locator) {
  await expect.soft(locator).toBeVisible({ timeout: 5_000 })
}

async function heading(page: Page, name: string | RegExp, level = 1) {
  await visible(page.getByRole('heading', { name, level, exact: true }))
}

async function visitSurfaces(page: Page, baseURL: string, info: TestInfo, surfaces: Surface[]) {
  const browserErrors: Array<{ url: string; error: string }> = []
  const serverErrors: Array<{ url: string; status: number }> = []
  const visits: Array<{ path: string; expectedPath: string; actualUrl: string; status: number | null; horizontalOverflow: number | null }> = []
  const pageError = (error: Error) => browserErrors.push({ url: page.url(), error: error.message })
  const responseError = (response: Awaited<ReturnType<Page['goto']>>) => {
    if (response && new URL(response.url()).origin === baseURL && response.status() >= 500) {
      serverErrors.push({ url: response.url(), status: response.status() })
    }
  }

  page.on('pageerror', pageError)
  page.on('response', responseError)
  try {
    for (const { path, destination = path, verify } of surfaces) {
      await test.step(`Render ${path}${destination === path ? '' : ` → ${destination}`}`, async () => {
        let status: number | null = null
        let horizontalOverflow: number | null = null
        try {
          const response = await page.goto(path, { waitUntil: 'load', timeout: 25_000 })
          status = response?.status() ?? null
          expect.soft(status, `${path} document HTTP status`).toBe(200)
          await expect.soft(page, `${path} destination`).toHaveURL(new URL(destination, baseURL).href, { timeout: 5_000 })
          await verify(page)
          await expect.soft(page.getByText(/^(Something went wrong\.|Application error:)/)).toHaveCount(0, { timeout: 2_000 })
          horizontalOverflow = await page.evaluate(() => {
            const root = document.documentElement
            return Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth
          })
          expect.soft(horizontalOverflow, `${path} document horizontal overflow in CSS pixels`).toBeLessThanOrEqual(1)
        } catch (error) {
          expect.soft(error, `${path} navigation or render error`).toBeUndefined()
        } finally {
          visits.push({ path, expectedPath: destination, actualUrl: page.url(), status, horizontalOverflow })
          const name = path === '/' ? 'landing' : path.slice(1).replace(/[^a-z0-9-]+/gi, '-')
          try {
            await info.attach(`${name}.png`, {
              body: await page.screenshot({ animations: 'disabled', scale: 'css', timeout: 5_000 }),
              contentType: 'image/png',
            })
          } catch (error) {
            expect.soft(error, `${path} screenshot error`).toBeUndefined()
          }
        }
      })
    }
  } finally {
    page.off('pageerror', pageError)
    page.off('response', responseError)
    await info.attach('screen-evidence.json', {
      body: JSON.stringify({ visits, browserErrors, serverErrors }, null, 2),
      contentType: 'application/json',
    })
    expect.soft(browserErrors, 'Uncaught browser exceptions').toEqual([])
    expect.soft(serverErrors, 'First-party HTTP server errors').toEqual([])
  }
}

type Tenant = ReturnType<typeof createQaFixture>

async function withTenant(page: Page, baseURL: string, run: (tenant: Tenant) => Promise<void>) {
  const tenant = createQaFixture(baseURL)
  try {
    await tenant.seed()
    await page.context().addCookies(tenant.cookies())
    await run(tenant)
  } finally {
    try { await page.close() } finally { await tenant.cleanup() }
  }
}

test('[QA:SETTINGS-SCREENS] identity, appearance, notification and team settings render', async ({ page, baseURL }, info) => {
  test.setTimeout(240_000)
  await withTenant(page, baseURL!, async tenant => {
    const company = async (p: Page) => {
      await heading(p, 'Company')
      await heading(p, 'Brand', 2)
      await expect.soft(p.getByRole('textbox', { name: /^Company Name/ })).toHaveValue(tenant.companyName, { timeout: 5_000 })
    }
    const account = async (p: Page) => {
      await heading(p, 'Account')
      await visible(p.getByRole('textbox', { name: 'Your name', exact: true }))
      await expect.soft(p.getByRole('link', { name: 'Delete account', exact: true })).toHaveAttribute('href', '/delete-account', { timeout: 5_000 })
    }
    const team = async (p: Page) => {
      await heading(p, 'Team')
      await heading(p, 'Members', 2)
      await visible(p.getByText('Owner', { exact: true }))
      await expect.soft(p.getByTestId('team-coming-soon')).toHaveText('Inviting teammates is on the way.', { timeout: 5_000 })
    }
    await visitSurfaces(page, baseURL!, info, [
      { path: '/settings', destination: '/settings/company', verify: company },
      { path: '/settings/company', verify: company },
      { path: '/settings/account', verify: account },
      { path: '/settings/general', destination: '/settings/account', verify: account },
      { path: '/settings/appearance', verify: async p => {
        await heading(p, 'Appearance')
        await visible(p.getByRole('radiogroup', { name: 'Theme preference', exact: true }))
      } },
      { path: '/settings/notifications', verify: async p => {
        await heading(p, 'Notifications')
        await visible(p.getByTestId('master-email-digest'))
      } },
      { path: '/settings/team', verify: team },
      { path: '/settings/staff', destination: '/settings/team', verify: team },
    ])
  })
})

test('[QA:ESTIMATE-SETTINGS-SCREENS] estimate, billing, integrations and knowledge settings render', async ({ page, baseURL }, info) => {
  test.setTimeout(300_000)
  await withTenant(page, baseURL!, async () => {
    const defaults = async (p: Page) => {
      await heading(p, 'Estimate defaults')
      await visible(p.locator('input[type="number"][name="defaultTaxRate"]'))
      for (const id of ['email-delivery', 'sms-delivery']) {
        const toggle = p.locator(`#${id}`)
        await visible(toggle)
        await expect.soft(toggle).toHaveAttribute('aria-checked', 'false', { timeout: 5_000 })
      }
    }
    const clientActions = async (p: Page) => {
      await heading(p, 'Client actions')
      await visible(p.getByText('View and download', { exact: true }))
      await expect.soft(p.getByTestId('client-action-payments')).toHaveCount(0, { timeout: 5_000 })
    }
    await visitSurfaces(page, baseURL!, info, [
      { path: '/settings/estimates', verify: defaults },
      { path: '/settings/defaults', destination: '/settings/estimates', verify: defaults },
      { path: '/settings/delivery', destination: '/settings/estimates', verify: defaults },
      { path: '/settings/estimate-templates', verify: async p => {
        await heading(p, 'Client message')
        await visible(p.getByRole('textbox', { name: 'Greeting', exact: true }))
      } },
      { path: '/settings/client-actions', verify: clientActions },
      { path: '/settings/payments', destination: '/settings/client-actions', verify: clientActions },
      { path: '/settings/integrations/stripe', destination: '/settings/client-actions', verify: clientActions },
      { path: '/settings/billing', verify: async p => {
        await heading(p, 'Plan and billing')
        const plan = p.getByTestId('plan-overview')
        await visible(plan.getByText('Current plan', { exact: true }))
        await visible(plan.getByText('Credits', { exact: true }))
      } },
      { path: '/settings/integrations', verify: async p => {
        await heading(p, 'Integrations')
        const link = p.getByRole('link', { name: /MCP Server/ })
        await visible(link)
        await expect.soft(link).toHaveAttribute('href', '/settings/integrations/mcp', { timeout: 5_000 })
      } },
      { path: '/settings/integrations/mcp', verify: async p => {
        await heading(p, 'MCP Server')
        await visible(p.getByRole('button', { name: 'Copy URL', exact: true }))
      } },
      { path: '/settings/knowledge', verify: async p => {
        await heading(p, 'AI knowledge')
        await visible(p.getByRole('link', { name: 'New entry', exact: true }))
      } },
      { path: '/settings/knowledge/new', verify: async p => {
        await heading(p, 'New knowledge entry')
        await visible(p.getByRole('textbox', { name: 'Title', exact: true }))
      } },
    ])
  })
})

test('[QA:WORKSPACE-SCREENS] notifications, Academy catalog and retired chat route render expected states', async ({ page, baseURL }, info) => {
  await withTenant(page, baseURL!, async () => {
    await visitSurfaces(page, baseURL!, info, [
      { path: '/notifications', verify: async p => {
        await visible(p.getByRole('button', { name: 'Unread only', exact: true }))
        await expect.soft(p.getByTestId('notifications-empty')).toHaveText('No notifications yet.', { timeout: 5_000 })
      } },
      { path: '/academy', verify: async p => {
        await heading(p, 'Academy')
        await visible(p.locator('h2 a[href^="/academy/"]').first())
      } },
      { path: '/chat', destination: '/dashboard', verify: async p => heading(p, 'Dashboard') },
    ])
  })
})

test('[QA:PUBLIC-SCREENS] marketing, sign-in, publication and legal screens render anonymously', async ({ page, baseURL }, info) => {
  test.setTimeout(240_000)
  const legal = (name: RegExp) => async (p: Page) => {
    await heading(p, name)
    await expect.soft(p.locator('article.prose')).toContainText(/\S/, { timeout: 5_000 })
  }
  await visitSurfaces(page, baseURL!, info, [
    { path: '/', verify: async p => {
      await heading(p, /\S/)
      const demo = p.getByRole('link', { name: 'See Demo', exact: true })
      await visible(demo)
      await expect.soft(demo).toHaveAttribute('href', '/demo/entry', { timeout: 5_000 })
    } },
    { path: '/login', verify: async p => {
      await heading(p, /^Sign in to /)
      await visible(p.getByLabel('Phone number', { exact: true }))
      await visible(p.getByRole('button', { name: 'Send code', exact: true }))
    } },
    { path: '/industries', verify: async p => {
      await heading(p, 'Estimating that speaks your trade.')
      await expect.soft(p.getByRole('link', { name: /General Contractors/ })).toHaveAttribute('href', '/industries/general-contractors', { timeout: 5_000 })
    } },
    { path: '/industries/general-contractors', verify: async p => {
      await heading(p, 'AI Estimating Software for General Contractors')
      await visible(p.getByRole('link', { name: 'Create your first estimate', exact: true }))
    } },
    { path: '/blog', verify: async p => {
      await heading(p, 'Blog')
      const article = p.locator('article h2 a[href^="/blog/"]').first()
      await visible(article.or(p.getByText('No posts yet.', { exact: true })))
    } },
    { path: '/privacy-policy', verify: legal(/Privacy Policy/i) },
    { path: '/terms-of-service', verify: legal(/Terms of Service/i) },
    { path: '/delete-account', verify: async p => {
      await heading(p, /^Delete your .+ account$/)
      await heading(p, 'What gets deleted', 2)
      await visible(p.locator('article').getByRole('link', { name: 'Sign in', exact: true }))
    } },
    { path: '/offline', verify: async p => {
      await heading(p, "You're offline")
      await expect.soft(p.getByRole('link', { name: 'Go to dashboard', exact: true })).toHaveAttribute('href', '/dashboard', { timeout: 5_000 })
    } },
  ])
})
