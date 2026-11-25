import type { Locator, Page } from '@playwright/test'
import { expect, test } from './test'
import { qaBlogArticleMarker, qaBlogAuthor, qaBlogComparison, qaBlogDraft, qaBlogOtherMonth, qaBlogPrimary, qaBlogTag } from './fixtures/managed-content'

const articlePath = `/blog/${qaBlogPrimary.slug}`
const authorPath = `/blog/author/${qaBlogAuthor.slug}`
const tagPath = `/blog/tag/${qaBlogTag}`
const year = qaBlogPrimary.published_at.slice(0, 4)
const monthSegment = qaBlogPrimary.published_at.slice(0, 7)
const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(qaBlogPrimary.published_at))
const yearPath = `/blog/archive/${year}`
const monthPath = `${yearPath}/${monthSegment.slice(-2)}`

async function canonicalPath(page: Page, pathname: string) {
  const expected = new URL(pathname, page.url()).href
  // During a streamed client navigation React may briefly retain the previous
  // head entry. Require exactly one final canonical, including its origin.
  await expect.poll(() => page.locator('link[rel="canonical"]').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('href')),
  )).toEqual([expected])
}

async function follow(page: Page, link: Locator, pathname: string) {
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', pathname)
  await link.click()
  await expect(page).toHaveURL(url => url.pathname === pathname)
}

async function publishedFilter(page: Page, heading: string, pathname: string, includesOtherMonth = false) {
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: heading, level: 1, exact: true })).toBeVisible()
  await expect(main.getByRole('link', { name: qaBlogPrimary.title, exact: true })).toHaveAttribute('href', articlePath)
  await expect(main.getByRole('link', { name: qaBlogComparison.title, exact: true })).toHaveCount(0)
  await expect(main.getByRole('link', { name: qaBlogDraft.title, exact: true })).toHaveCount(0)
  const otherMonth = main.getByRole('link', { name: qaBlogOtherMonth.title, exact: true })
  if (includesOtherMonth) await expect(otherMonth).toHaveAttribute('href', `/blog/${qaBlogOtherMonth.slug}`)
  else await expect(otherMonth).toHaveCount(0)
  await canonicalPath(page, pathname)
}

async function verifyArchiveDates(main: Locator, period: string) {
  const dateTimes = await main.locator('article h2 a').evaluateAll(links => links.map(link =>
    link.closest('article')?.querySelector('time')?.getAttribute('datetime') ?? null,
  ))
  expect(dateTimes.length).toBeGreaterThan(0)
  for (const value of dateTimes) {
    expect(value).not.toBeNull()
    expect(new Date(value!).toISOString().slice(0, period.length)).toBe(period)
  }
}

test('[QA:PUBLIC-CONTENT-ROUTES] published article, author, tag and archive links exclude the managed draft', async ({ page, context }) => {
  await context.clearCookies()
  expect((await page.goto('/blog', { waitUntil: 'load' }))?.status()).toBe(200)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Blog', level: 1, exact: true })).toBeVisible()
  const primary = main.getByRole('link', { name: qaBlogPrimary.title, exact: true })
  await expect(primary, 'Managed primary DEV article required').toBeVisible()
  await expect(main.getByRole('link', { name: qaBlogComparison.title, exact: true }), 'Managed comparison DEV article required').toHaveAttribute('href', `/blog/${qaBlogComparison.slug}`)
  await expect(main.getByRole('link', { name: qaBlogOtherMonth.title, exact: true }), 'Managed same-year alternate-month article required').toHaveAttribute('href', `/blog/${qaBlogOtherMonth.slug}`)
  await expect(main.getByRole('link', { name: qaBlogDraft.title, exact: true })).toHaveCount(0)

  await follow(page, primary, articlePath)
  await expect(main.getByRole('heading', { name: qaBlogPrimary.title, level: 1, exact: true })).toBeVisible()
  await expect(main.getByText(qaBlogArticleMarker, { exact: true })).toBeVisible()
  await expect(main.locator('time')).toHaveAttribute('datetime', /^2026-10-13T/)
  await canonicalPath(page, articlePath)
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article')
  const schema = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.flatMap(node => {
    const payload = JSON.parse(node.textContent ?? 'null')
    return Array.isArray(payload) ? payload : [payload]
  }))
  expect(schema).toContainEqual(expect.objectContaining({ '@type': 'Article', headline: qaBlogPrimary.title }))
  expect(schema).toContainEqual(expect.objectContaining({ '@type': 'BreadcrumbList', itemListElement: expect.arrayContaining([
    expect.objectContaining({ name: qaBlogPrimary.title }),
  ]) }))

  await follow(page, main.getByRole('link', { name: qaBlogAuthor.name, exact: true }), authorPath)
  await publishedFilter(page, `Posts by ${qaBlogAuthor.name}`, authorPath)

  const tags = main.getByRole('navigation', { name: 'Tags', exact: true })
  await follow(page, tags.getByRole('link', { name: `#${qaBlogTag}`, exact: true }), tagPath)
  await publishedFilter(page, `#${qaBlogTag}`, tagPath)

  const archives = main.getByRole('navigation', { name: 'Archive', exact: true })
  await follow(page, archives.getByRole('link', { name: year, exact: true }), yearPath)
  await publishedFilter(page, year, yearPath, true)
  await verifyArchiveDates(main, year)

  await follow(page, archives.getByRole('link', { name: new RegExp(`^${month} \\(\\d+\\)$`) }).and(archives.locator(`a[href="${monthPath}"]`)), monthPath)
  await publishedFilter(page, `${month} ${year}`, monthPath)
  await verifyArchiveDates(main, monthSegment)

  const draftPath = `/blog/${qaBlogDraft.slug}`
  const draft = await page.goto(draftPath, { waitUntil: 'load' })
  // Next may stream notFound after sending a successful document header.
  expect([200, 404]).toContain(draft?.status())
  await expect(page).toHaveURL(new URL(draftPath, page.url()).href)
  await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible()
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
  await expect(page.getByText(qaBlogDraft.title, { exact: true })).toHaveCount(0)
  await expect(page.getByText(qaBlogDraft.content, { exact: true })).toHaveCount(0)
  const metadata = await page.locator('title, meta[content], script[type="application/ld+json"]').evaluateAll(nodes => nodes
    .map(node => node.tagName === 'META' ? node.getAttribute('content') : node.textContent).join('\n'))
  for (const privateValue of [qaBlogDraft.title, qaBlogDraft.excerpt, qaBlogDraft.content]) expect(metadata).not.toContain(privateValue)
})
