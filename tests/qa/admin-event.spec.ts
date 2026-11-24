import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

// Keep evidence to assertions and counts from the exact synthetic attempt.
test.use({ trace: 'off', video: 'off', screenshot: 'off' })

test('[QA:ADMIN-EVENT-DETAIL] reads the ordered failure timeline for its own synthetic attempt', async ({ page, baseURL }, info) => {
  test.setTimeout(180_000)
  const tenant = createQaFixture(baseURL!, { platformAdmin: true })
  const path = `/admin/events/${tenant.adminAttemptId}`
  const main = page.getByRole('main')
  let seeded = false
  let aggregateVerified = false
  let listed = false
  let textSearchVerified = false
  let timelineVerified = false
  try {
    await tenant.seed()
    await tenant.seedAdminAttempt()
    seeded = true
    expect(await tenant.readAdminAttempt()).toMatchObject({ attempt_id: tenant.adminAttemptId,
      project_id: tenant.projectId, step_reached: 'transcribe', terminal_status: 'failed', event_count: 3,
      error_message: tenant.adminAttemptError, error_code: 'QA_SYNTHETIC_FAILURE' })
    aggregateVerified = true
    await page.context().addCookies(tenant.cookies())
    const listPath = `/admin/events?q=${tenant.adminAttemptId}`
    expect((await page.goto(listPath))?.status()).toBe(200)
    await expect(main.getByRole('heading', { name: 'Event Log', exact: true })).toBeVisible()
    const link = main.getByRole('link', { name: 'View →', exact: true })
    await expect(link).toHaveAttribute('href', path)
    expect(await main.locator('tbody tr').count()).toBe(1)
    const row = main.getByRole('row').filter({ has: link })
    await expect(row.getByText('transcribe', { exact: true })).toBeVisible()
    await expect(row.getByText('failed', { exact: true })).toBeVisible()
    listed = true

    const search = main.getByPlaceholder('Search by user, project, estimate, attempt ID, or error…', { exact: true })
    await search.fill(tenant.adminAttemptSearchText)
    await search.press('Enter')
    await expect(page).toHaveURL(url => url.pathname === '/admin/events' && url.searchParams.get('q') === tenant.adminAttemptSearchText)
    expect((await page.reload())?.status()).toBe(200)
    await expect(search).toHaveValue(tenant.adminAttemptSearchText)
    await expect(link).toHaveAttribute('href', path)
    expect(await main.locator('tbody tr').count()).toBe(1)
    textSearchVerified = true

    await link.click()
    await expect(page).toHaveURL(new URL(path, baseURL).href)
    await expect(main.getByRole('heading', { name: `Attempt ${tenant.adminAttemptId.slice(0, 8)}…`, exact: true })).toBeVisible()
    await expect(main.getByText(tenant.adminAttemptId, { exact: true })).toBeVisible()
    await expect(main.getByText(`Project: ${tenant.projectId.slice(0, 8)}…`, { exact: true })).toBeVisible()
    await expect(main.getByText('Failed at step: transcribe', { exact: true })).toBeVisible()
    await expect(main.getByRole('heading', { name: 'Step timeline', exact: true })).toBeVisible()

    const cards = main.locator('[data-slot="card"]')
    expect(await cards.count()).toBe(4)
    for (const [index, step, status] of [[1, 'save_recording', 'succeeded'], [2, 'transcribe', 'started'], [3, 'transcribe', 'failed']] as const) {
      await expect(cards.nth(index).getByText(step, { exact: true })).toBeVisible()
      await expect(cards.nth(index).getByText(status, { exact: true })).toBeVisible()
    }
    await expect(cards.nth(3).getByText('QA_SYNTHETIC_FAILURE', { exact: true })).toBeVisible()
    await expect(cards.nth(3).getByText(tenant.adminAttemptError, { exact: true })).toBeVisible()
    timelineVerified = true
  } finally {
    try {
      await info.attach('own-admin-attempt.json', {
        body: JSON.stringify({ seededSyntheticTimeline: seeded, aggregateVerified, listed, textSearchVerified, timelineVerified }),
        contentType: 'application/json',
      })
    } finally {
      try { await page.close() } finally { await tenant.cleanup() }
    }
  }
})
