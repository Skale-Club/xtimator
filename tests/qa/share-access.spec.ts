import type { BrowserContext, Page } from '@playwright/test'
import { generatePublicSlugToken, slugify } from '../../lib/estimate/public-url'
import { createQaFixture } from './fixtures/tenant'
import { typeSignature } from './fixtures/keyboard-signature'
import { expect, test } from './test'

type Tenant = ReturnType<typeof createQaFixture>
type FixtureOptions = NonNullable<Parameters<typeof createQaFixture>[1]>

const UNLOCK_COOKIE = 'estimate_unlock'
const OWNER_PREVIEW = "You're viewing your own estimate. This visit isn't counted in Insights."

async function withTenant(page: Page, baseURL: string, options: FixtureOptions, work: (fixture: Tenant) => Promise<void>) {
  const fixture = createQaFixture(baseURL, options)
  try {
    await fixture.seed()
    await work(fixture)
  } finally {
    try {
      await page.close()
    } finally {
      await fixture.cleanup()
    }
  }
}

function brandedPath(fixture: Tenant) {
  if (!fixture.companySlug || !fixture.publicSlugToken) throw new Error('Expected the generated branded share fixture')
  return `/estimate/${fixture.companySlug}/${slugify(fixture.projectName)}-${fixture.publicSlugToken}`
}

async function openOwnerShare(page: Page, fixture: Tenant) {
  await page.context().addCookies(fixture.cookies())
  expect((await page.goto(`/projects/${fixture.projectId}`))?.status()).toBe(200)
  await page.getByRole('button', { name: 'Share', exact: true }).filter({ visible: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Share estimate', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

async function leaveOwner(page: Page) {
  await page.goto('about:blank')
  await page.context().clearCookies()
}

async function expectNoIndex(page: Page) {
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
}

async function expectEstimateContent(page: Page, fixture: Tenant) {
  await expect(page).toHaveTitle(`Estimate from ${fixture.companyName}`)
  await expect(page.getByText(fixture.lineDescription, { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByText(fixture.sectionTitle, { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByText('$1,000.00', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await expectNoIndex(page)
}

async function expectHiddenEstimate(page: Page, fixture: Tenant, brandingVisible = false) {
  const markers = {
    project: fixture.projectName, client: fixture.clientName, summary: fixture.summary,
    section: fixture.sectionTitle, line: fixture.lineDescription, amount: '$1,000.00',
  }
  const html = await page.content()
  for (const [field, value] of Object.entries(brandingVisible ? markers : { ...markers, company: fixture.companyName })) {
    expect(html.includes(value), `The response HTML must not contain the protected ${field}`).toBe(false)
  }
  const metadata = await page.locator('meta[content]').evaluateAll(elements => elements.map(el => el.getAttribute('content') ?? ''))
  for (const [field, value] of Object.entries({ ...markers, company: fixture.companyName })) {
    expect(metadata.some(content => content.includes(value)), `Metadata must not contain the protected ${field}`).toBe(false)
  }
  await expectNoIndex(page)
}

async function expectSignedPdfDenied(page: Page, fixture: Tenant, status: number, error: string) {
  const response = await page.request.get(`/api/estimates/${fixture.estimateId}/pdf?token=${fixture.shareToken}`, { maxRedirects: 0 })
  expect(response.status()).toBe(status)
  expect(response.headers()['content-type']).toContain('application/json')
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(await response.json()).toEqual({ error })
}

async function hasUnlockCookie(context: BrowserContext) {
  return (await context.cookies()).some(cookie => cookie.name === UNLOCK_COOKIE)
}

test('[QA:SHARE-BRANDED] the owner opens a branded estimate link that resolves by its exact short token', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  await withTenant(page, baseURL!, { brandedShare: true }, async fixture => {
    const path = brandedPath(fixture)
    const url = new URL(path, baseURL!).href
    expect((await fixture.readEstimate())?.public_slug_token).toBe(fixture.publicSlugToken)
    const dialog = await openOwnerShare(page, fixture)
    await expect(dialog.getByTestId('send-hub-url')).toHaveText(url.replace(/^https?:\/\//, ''))

    const [preview] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 25_000 }),
      dialog.getByRole('button', { name: 'Open', exact: true }).click(),
    ])
    try {
      await expect(preview).toHaveURL(url)
      await expectEstimateContent(preview, fixture)
      await expect(preview.getByText(OWNER_PREVIEW, { exact: true })).toBeVisible()
    } finally {
      await preview.close()
    }

    await leaveOwner(page)
    expect((await page.goto(path))?.status()).toBe(200)
    await expectEstimateContent(page, fixture)
    await expect(page.getByText(OWNER_PREVIEW, { exact: true })).toHaveCount(0)

    // Slug prefixes are presentation only; the unguessable token identifies
    // the estimate. Changing the prefix must still render only this document.
    expect((await page.goto(`/estimate/another-company/another-project-${fixture.publicSlugToken}`))?.status()).toBe(200)
    await expectEstimateContent(page, fixture)

    const unknownShortToken = generatePublicSlugToken()
    const unknownEstimateSlug = `${slugify(fixture.projectName)}-${unknownShortToken}`
    for (const badPath of [
      `/estimate/${fixture.companySlug}/short`,
      `/estimate/${fixture.companySlug}/${unknownEstimateSlug}`,
      `/estimate/not-the-fixture-company/${unknownEstimateSlug}`,
    ]) {
      const response = await page.goto(badPath)
      // Next can stream its not-found UI after the response status is committed.
      expect([200, 404]).toContain(response?.status())
      await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible()
      await expectHiddenEstimate(page, fixture)
    }
  })
})

test('[QA:SHARE-PASSWORD] the owner sets a password and the anonymous estimate unlocks only after the correct password', async ({ page, baseURL }, info) => {
  test.setTimeout(240_000)
  await withTenant(page, baseURL!, { brandedShare: true }, async fixture => {
    const path = `/estimate/${fixture.shareToken}`
    const password = 'QA synthetic estimate password'
    const dialog = await openOwnerShare(page, fixture)
    const settings = dialog.getByTestId('send-hub-share-password')
    await settings.getByRole('button', { name: 'Add password', exact: true }).click()
    await settings.getByLabel('Set a password', { exact: true }).fill(password)
    await settings.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(settings.getByText('Password protected', { exact: true })).toBeVisible()
    await expect.poll(async () => {
      const estimate = await fixture.readEstimate()
      return Boolean(estimate?.share_password_hash && estimate.share_password_hash !== password && estimate.share_password_set_at)
    }).toBe(true)

    await leaveOwner(page)
    for (const lockedPath of [path, brandedPath(fixture)]) {
      expect((await page.goto(lockedPath))?.status()).toBe(200)
      await expect(page.getByRole('heading', { name: 'This estimate is password-protected', exact: true })).toBeVisible()
      await expect(page).toHaveTitle('Protected estimate')
      // The public lock screen displays the sender's branding, with no estimate fields.
      await expectHiddenEstimate(page, fixture, true)
    }
    await expectSignedPdfDenied(page, fixture, 403, 'link_locked')
    expect(await hasUnlockCookie(page.context())).toBe(false)

    const field = page.getByLabel('Password', { exact: true })
    const unlock = page.getByRole('button', { name: 'Unlock estimate', exact: true })
    await field.fill('QA synthetic wrong password')
    await unlock.click()
    await expect(page.getByRole('alert').filter({ hasText: 'Incorrect password. Please try again.' })).toBeVisible()
    expect(await hasUnlockCookie(page.context())).toBe(false)
    await expectHiddenEstimate(page, fixture, true)
    await expectSignedPdfDenied(page, fixture, 403, 'link_locked')

    await field.fill(password)
    await unlock.click()
    await expectEstimateContent(page, fixture)
    const cookie = (await page.context().cookies()).find(item => item.name === UNLOCK_COOKIE)
    expect(cookie && { httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite, path: cookie.path })
      .toEqual({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' })
    expect((await page.reload())?.status()).toBe(200)
    await expectEstimateContent(page, fixture)
    expect((await page.goto(path))?.status()).toBe(200)
    await expectEstimateContent(page, fixture)
    // Anonymous PDF access exposes only a signed, frozen copy. Unlocking an
    // unsigned estimate must not bypass that separate contract.
    await expectSignedPdfDenied(page, fixture, 404, 'Signed estimate not found')
    const accept = info.project.name === 'chromium'
      ? page.getByTestId('proposal-bar').getByRole('button', { name: 'Accept', exact: true })
      : page.getByTestId('mobile-accept-bar').getByRole('button', { name: 'Accept Estimate', exact: true })
    await accept.click()
    const signature = page.getByRole('dialog', { name: 'Sign to accept this estimate', exact: true })
    await typeSignature(page, signature, 'QA Protected Estimate Signer')
    const [signed] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === `/api/estimates/${fixture.estimateId}/sign` && r.request().method() === 'POST'),
      signature.getByRole('button', { name: 'Sign & Accept Estimate', exact: true }).click(),
    ])
    expect(signed.status()).toBe(200)
    await expect(page.getByTestId('response-status')).toContainText('Estimate Accepted')
    expect((await fixture.readSignature())?.signer_name).toBe('QA Protected Estimate Signer')
    const pdf = await page.request.get(`/api/estimates/${fixture.estimateId}/pdf?token=${fixture.shareToken}`, { maxRedirects: 0 })
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
  })
})

test('[QA:SHARE-EXPIRED] expired canonical and branded links do not disclose estimate or PDF content', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  await withTenant(page, baseURL!, { brandedShare: true, expiredShare: true }, async fixture => {
    // No expiry control exists in the owner UI. Only the generated row is seeded in the past.
    const estimate = await fixture.readEstimate()
    expect(Date.parse(estimate?.share_expires_at)).toBe(Date.parse(fixture.shareExpiresAt!))
    expect(Date.parse(estimate?.share_expires_at)).toBeLessThan(Date.now())

    for (const path of [`/estimate/${fixture.shareToken}`, brandedPath(fixture)]) {
      expect((await page.goto(path))?.status()).toBe(200)
      await expect(page.getByRole('heading', { name: 'This estimate link has expired', exact: true })).toBeVisible()
      await expect(page).toHaveTitle('Estimate Not Found')
      await expectHiddenEstimate(page, fixture)
    }

    await expectSignedPdfDenied(page, fixture, 410, 'link_expired')
    const ownerPdf = await page.request.get(`/api/estimates/${fixture.estimateId}/pdf`, { maxRedirects: 0 })
    expect(ownerPdf.status()).toBe(401)
    expect(ownerPdf.headers()['content-type']).toContain('application/json')
    expect(await ownerPdf.json()).toEqual({ error: 'Not authenticated' })
  })
})
