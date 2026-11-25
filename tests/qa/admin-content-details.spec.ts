import type { Locator } from '@playwright/test'
import { expect, test } from './test'
import { createQaFixture } from './fixtures/tenant'
import { qaBlogPrimary } from './fixtures/managed-content'

test.use({ trace: 'off', video: 'off', screenshot: 'off' })

test('[QA:ADM-BLOG-DETAIL] admin reads the managed article and cannot edit a private company overlay as industry knowledge', async ({ context, baseURL }, info) => {
  const fixture = createQaFixture(baseURL!, { platformAdmin: true })
  const origin = new URL(baseURL!).origin
  const evidence: Array<{ route: string; status: number | null; rendered: boolean; pageErrors: number; serverErrors: number }> = []

  async function visit(route: string, id: string, heading: string, assertForm: (main: Locator) => Promise<void>) {
    const visit = { route, status: null as number | null, rendered: false, pageErrors: 0, serverErrors: 0 }
    evidence.push(visit)
    const page = await context.newPage()
    page.on('pageerror', () => { visit.pageErrors++ })
    page.on('response', response => {
      if (new URL(response.url()).origin === origin && response.status() >= 500) visit.serverErrors++
    })
    try {
      const path = route.replace('[id]', id)
      const result = await page.goto(path, { waitUntil: 'load', timeout: 30_000 })
      visit.status = result?.status() ?? null
      expect(visit.status).toBe(200)
      await expect(page).toHaveURL(new URL(path, origin).href)
      await expect(page.getByText(`Super Admin Mode - ${fixture.userEmail}`, { exact: true })).toBeVisible()
      const main = page.getByRole('main')
      await expect(main.getByRole('heading', { name: heading, level: 1, exact: true }), 'Managed DEV content required').toBeVisible()
      await assertForm(main)
      visit.rendered = true
    } finally {
      await page.close()
    }
    expect(visit.pageErrors).toBe(0)
    expect(visit.serverErrors).toBe(0)
  }

  try {
    await fixture.seed()
    await fixture.seedKnowledgeEntry()
    const originalKnowledge = await fixture.readKnowledgeEntry()
    expect(originalKnowledge).not.toBeNull()
    await context.addCookies(fixture.cookies())
    await test.step('Read the managed published article detail', async () => {
      await visit('/admin/blog/[id]', qaBlogPrimary.id, 'Edit blog post', async main => {
        await expect(main.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(qaBlogPrimary.title)
        await expect(main.getByRole('textbox', { name: 'Slug', exact: true })).toHaveValue(qaBlogPrimary.slug)
        await expect(main.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(qaBlogPrimary.content)
        await expect(main.getByRole('textbox', { name: 'Excerpt (optional)', exact: true })).toHaveValue(qaBlogPrimary.excerpt)
        await expect(main.getByRole('textbox', { name: 'Cover image URL (optional)', exact: true })).toHaveValue('')
        await expect(main.getByRole('combobox', { name: 'Status', exact: true })).toHaveText('Published')
        await expect(main.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0)
        await expect(main.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0)
      })
    })
    await test.step('Reject an owned company overlay in the industry editor without changing it', async () => {
      const page = await context.newPage()
      const path = `/admin/knowledge/${fixture.knowledgeEntryId}`
      const denied = { route: '/admin/knowledge/[id]', status: null as number | null, rendered: false, pageErrors: 0, serverErrors: 0 }
      evidence.push(denied)
      page.on('pageerror', () => { denied.pageErrors++ })
      page.on('response', response => {
        if (new URL(response.url()).origin === origin && response.status() >= 500) denied.serverErrors++
      })
      try {
        denied.status = (await page.goto(path, { waitUntil: 'load' }))?.status() ?? null
        expect([200, 404]).toContain(denied.status)
        await expect(page).toHaveURL(new URL(path, origin).href)
        await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible()
        await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
        await expect(page.getByRole('heading', { name: 'Edit knowledge entry', exact: true })).toHaveCount(0)
        await expect(page.getByRole('textbox', { name: 'Body', exact: true })).toHaveCount(0)
        await expect(page.getByText(fixture.knowledgeBody, { exact: true })).toHaveCount(0)
        denied.rendered = true
      } finally {
        await page.close()
      }
      expect(denied.pageErrors).toBe(0)
      expect(denied.serverErrors).toBe(0)
      expect(await fixture.readKnowledgeEntry()).toEqual(originalKnowledge)
    })
  } finally {
    try {
      await info.attach('admin-content-details.json', {
        body: JSON.stringify({ evidence }), contentType: 'application/json',
      })
    } finally {
      await fixture.cleanup()
    }
  }
})
