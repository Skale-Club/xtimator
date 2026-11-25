import type { Page } from '@playwright/test'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

// Admin workflows read other synthetic users and write privileged rows. Keep sanitized
// assertions only; every write targets rows created by these fixtures and is cleaned up.
test.use({ trace: 'off', video: 'off', screenshot: 'off' })

type Tenant = ReturnType<typeof createQaFixture>

const SUPPORT_COOKIE = 'support_mode_session'

/** Seeds the marked admin plus any synthetic targets, always cleaning every fixture. */
async function withAdmin(
  page: Page,
  baseURL: string,
  run: (admin: Tenant, makeTarget: () => Promise<Tenant>) => Promise<void>,
) {
  const admin = createQaFixture(baseURL, { platformAdmin: true })
  const targets: Tenant[] = []
  try {
    await admin.seed()
    await page.context().addCookies(admin.cookies())
    await run(admin, async () => {
      const target = createQaFixture(baseURL)
      targets.push(target)
      await target.seed()
      return target
    })
  } finally {
    try { await page.close() } finally {
      // Targets first so an interrupted grant is removed while the admin still exists.
      for (const target of targets) await target.cleanup()
      await admin.cleanup()
    }
  }
}

async function grantViaUi(page: Page, email: string) {
  await page.goto('/admin/admins')
  await expect(page.getByRole('heading', { level: 1, name: 'Platform admins', exact: true })).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Add platform admin', exact: true })
  const trigger = page.getByRole('button', { name: 'Add admin', exact: true })
  // The trigger ignores clicks until the client component has hydrated.
  await expect(async () => {
    await trigger.click()
    await expect(dialog).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
  await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await dialog.getByRole('button', { name: 'Add admin', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const row = page.getByRole('row').filter({ has: page.getByText(email, { exact: true }) })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Admin since')
  await expect(row.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled()
  return row
}

async function revokeViaUi(page: Page, email: string) {
  const row = page.getByRole('row').filter({ has: page.getByText(email, { exact: true }) })
  await row.getByRole('button', { name: 'Remove', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Remove platform admin?', exact: true })
  await expect(confirm).toContainText(email)
  await confirm.getByRole('button', { name: 'Remove admin', exact: true }).click()
  await expect(confirm).toHaveCount(0)
  await expect(row).toHaveCount(0)
}

function supportBanner(page: Page) {
  return page.locator('span', { hasText: /^Viewing / })
    .filter({ has: page.getByRole('button', { name: 'Exit view', exact: true }) })
}

/**
 * Admin errors are redacted from reports, so each step records a fixed, data-free
 * label when it fails (whitelisted in scripts/qa/report-privacy.mjs).
 */
async function step<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    test.info().annotations.push({ type: 'qa-admin-step-failure', description: label })
    throw error
  }
}

async function supportStartFailure(page: Page) {
  const toast = page.getByText(/^Couldn't view as this company\./).first()
  if (!await toast.isVisible().catch(() => false)) return null
  const text = await toast.textContent().catch(() => '') ?? ''
  return /Sign in again/.test(text) ? 'signin' : /APP_ENCRYPTION_KEY/.test(text) ? 'key' : 'other'
}

async function startSupportViaUi(page: Page, company: Tenant) {
  await step('support:list', async () => {
    await page.goto(`/admin/companies?q=${encodeURIComponent(company.companyName)}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Companies', exact: true })).toBeVisible()
  })
  const row = page.getByRole('row').filter({ hasText: company.companyName })
  const start = row.getByRole('button', { name: /View as Company/ })
  await step('support:row', async () => {
    await expect(row).toHaveCount(1)
    await expect(start).toBeVisible()
  })
  const banner = supportBanner(page)
  // The button ignores clicks until hydrated. Click again only while still on the list;
  // once the action ran, the app navigates to /dashboard and the row no longer exists.
  let clicks = 0
  try {
    await step('support:start', async () => {
      await expect(async () => {
        if (/\/admin\/companies/.test(new URL(page.url()).pathname)) {
          const failure = await supportStartFailure(page)
          if (failure) {
            test.info().annotations.push({ type: 'qa-admin-step-failure', description: `support:start-${failure}` })
            throw new Error('Support mode start was rejected')
          }
          if (await start.isVisible()) {
            await start.click({ timeout: 5_000 })
            clicks++
          }
        }
        await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 })
      }).toPass({ timeout: 45_000 })
    })
  } catch (error) {
    // Fixed, data-free labels: how many clicks landed and which kind of page the browser ended on.
    const path = new URL(page.url()).pathname
    const at = /^\/admin\/companies/.test(path) ? 'list' : /^\/dashboard/.test(path) ? 'dashboard'
      : /^\/onboarding/.test(path) ? 'onboarding' : /^\/(?:login|sign-?in)/.test(path) ? 'login' : 'other'
    test.info().annotations.push(
      { type: 'qa-admin-step-failure', description: `support:start-clicks-${Math.min(clicks, 2) === 2 ? 'many' : clicks}` },
      { type: 'qa-admin-step-failure', description: `support:start-at-${at}` },
    )
    throw error
  }
  await step('support:banner', () => expect(banner).toBeVisible({ timeout: 20_000 }))
  return banner
}

async function exitSupportViaUi(page: Page) {
  await step('support:exit', async () => {
    await supportBanner(page).getByRole('button', { name: 'Exit view', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/companies$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Companies', exact: true })).toBeVisible()
  })
}

async function supportCookie(page: Page) {
  return (await page.context().cookies()).find(cookie => cookie.name === SUPPORT_COOKIE)
}

test('[QA:ADM-INDUSTRY-DETAIL] an admin opens an industry knowledge entry from the list and reads its real content', async ({ page, baseURL }, info) => {
  await withAdmin(page, baseURL!, async admin => {
    await admin.seedIndustryEntry()
    const original = await admin.readIndustryEntry()
    expect(original?.industry_id).toBe(admin.industryEntryIndustryId)
    expect(original?.embedding).toBeNull()

    await page.goto('/admin/knowledge')
    await expect(page.getByRole('heading', { level: 1, name: 'Industry knowledge base', exact: true })).toBeVisible()
    const link = page.getByRole('link', { name: admin.industryEntryTitle, exact: true })
    await expect(link).toHaveCount(1)
    const listed = page.getByRole('row').filter({ has: link })
    await expect(listed).toContainText(admin.industryEntrySource)
    await expect(listed).toContainText('Needs reindex')
    await Promise.all([page.waitForURL(`**/admin/knowledge/${admin.industryEntryId}`), link.click()])

    await expect(page.getByRole('heading', { level: 1, name: 'Edit knowledge entry', exact: true })).toBeVisible()
    const main = page.getByRole('main')
    await expect(main.getByRole('combobox', { name: 'Industry', exact: true })).toHaveText('Painting')
    await expect(main.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(admin.industryEntryTitle)
    await expect(main.getByRole('textbox', { name: 'Body', exact: true })).toHaveValue(admin.industryEntryBody)
    await expect(main.getByRole('textbox', { name: 'Source (optional)', exact: true })).toHaveValue(admin.industryEntrySource)
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
    // Read only: opening the editor must not change the persisted entry.
    expect(await admin.readIndustryEntry()).toEqual(original)
    await info.attach('admin-industry-detail-evidence.json', {
      body: JSON.stringify({ listed: true, detailFields: ['industry', 'title', 'body', 'source'], persistedUnchanged: true }),
      contentType: 'application/json',
    })
  })
})

test('[QA:ADM-GRANT-REVOKE] an admin grants platform admin to a synthetic user, sees it listed, then revokes it', async ({ page, baseURL }, info) => {
  test.setTimeout(180_000)
  await withAdmin(page, baseURL!, async (admin, makeTarget) => {
    const target = await makeTarget()
    expect(await target.readPlatformAdminGrant()).toBeNull()

    await grantViaUi(page, target.userEmail)
    expect((await target.readPlatformAdminGrant())?.user_id).toBe(target.userId)
    await page.reload()
    const listed = page.getByRole('row').filter({ has: page.getByText(target.userEmail, { exact: true }) })
    await expect(listed).toHaveCount(1)
    // The caller keeps their own row and a second admin now exists.
    await expect(page.getByRole('row').filter({ has: page.getByText(admin.userEmail, { exact: true }) })).toContainText('You')

    await revokeViaUi(page, target.userEmail)
    expect(await target.readPlatformAdminGrant()).toBeNull()
    await page.reload()
    await expect(page.getByRole('row').filter({ has: page.getByText(target.userEmail, { exact: true }) })).toHaveCount(0)
    await expect(page.getByRole('row').filter({ has: page.getByText(admin.userEmail, { exact: true }) })).toHaveCount(1)
    await info.attach('admin-grant-revoke-evidence.json', {
      body: JSON.stringify({ granted: true, listed: true, revoked: true, ownRowKept: true }), contentType: 'application/json',
    })
  })
})

test('[QA:ADM-SUPPORT-MODE] an admin views a synthetic company as support and exits the session', async ({ page, baseURL }, info) => {
  test.setTimeout(180_000)
  await withAdmin(page, baseURL!, async (admin, makeTarget) => {
    const company = await makeTarget()
    expect(await supportCookie(page)).toBeUndefined()

    const banner = await startSupportViaUi(page, company)
    await step('support:banner-content', async () => {
      await expect(banner).toContainText(company.companyName)
      await expect(banner).toContainText(admin.userEmail)
    })
    await step('support:cookie', async () => {
      const cookie = await supportCookie(page)
      expect(cookie?.httpOnly).toBe(true)
      expect(cookie?.value.length).toBeGreaterThan(20)
    })

    await exitSupportViaUi(page)
    await step('support:cleared', async () => {
      expect(await supportCookie(page)).toBeUndefined()
      await page.goto('/dashboard')
      await expect(supportBanner(page)).toHaveCount(0)
    })
    await info.attach('admin-support-mode-evidence.json', {
      body: JSON.stringify({ started: true, bannerNamedCompanyAndAdmin: true, cookieHttpOnly: true, exited: true, cookieCleared: true }),
      contentType: 'application/json',
    })
  })
})

test('[QA:ADM-AUDIT] grant, revoke and support mode each leave an audit row attributed to the acting admin', async ({ page, baseURL }, info) => {
  test.setTimeout(240_000)
  await withAdmin(page, baseURL!, async (admin, makeTarget) => {
    const user = await makeTarget()
    const company = await makeTarget()

    await grantViaUi(page, user.userEmail)
    await revokeViaUi(page, user.userEmail)
    await startSupportViaUi(page, company)
    await exitSupportViaUi(page)

    // The audit log has no admin screen, so read the append-only rows through the fixture's own actor scope.
    // The grant and support logs are fire-and-forget on the server, hence the poll.
    await step('audit:rows', () => expect.poll(async () => (await admin.readAuditRows()).map(row => row.action).sort(), { timeout: 20_000 })
      .toEqual(expect.arrayContaining(['admin.add', 'admin.remove', 'company.support_mode_start', 'company.support_mode_end'])))
    await step('audit:fields', () => assertAuditFields(admin, user, company))
    await info.attach('admin-audit-evidence.json', {
      body: JSON.stringify({ actions: (await admin.readAuditRows()).map(row => row.action), actorMatchesAdmin: true, uiSurface: 'none' }),
      contentType: 'application/json',
    })
  })
})

async function assertAuditFields(admin: Tenant, user: Tenant, company: Tenant) {
    const rows = await admin.readAuditRows()
    const only = (action: string) => rows.filter(row => row.action === action)
    expect(rows.every(row => row.actor_email === admin.userEmail)).toBe(true)

    const [added] = only('admin.add')
    expect(added).toMatchObject({ target_type: 'user', target_id: user.userId, metadata: { email: user.userEmail } })
    const [removed] = only('admin.remove')
    expect(removed).toMatchObject({ target_type: 'user', target_id: user.userId })
    expect(only('company.support_mode_start').every(row => row.target_type === 'company' && row.target_id === company.companyId)).toBe(true)
    const [ended] = only('company.support_mode_end')
    expect(ended).toMatchObject({ target_type: 'company', target_id: company.companyId })
    expect(Number.isInteger((ended.metadata as { durationSeconds?: unknown }).durationSeconds)).toBe(true)
    // Revocation is recorded after the grant, and the support session ends after it starts.
    expect(Date.parse(removed.created_at)).toBeGreaterThanOrEqual(Date.parse(added.created_at))
    expect(Date.parse(ended.created_at)).toBeGreaterThanOrEqual(Date.parse(only('company.support_mode_start')[0].created_at))
}
