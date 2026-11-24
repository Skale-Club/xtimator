import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { FIXTURE_COURSE_ID, FIXTURE_LESSON_IDS } from '../../lib/academy/fixture-source'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

async function waitForLessonTrack(page: Page, field: 'event' | 'completeSource', value: string, completed: boolean) {
  const response = await page.waitForResponse(candidate => {
    const request = candidate.request()
    if (new URL(candidate.url()).pathname !== '/api/academy/track' || request.method() !== 'POST') return false
    const input = request.postDataJSON()
    return input?.courseId === FIXTURE_COURSE_ID && input.lessonId === FIXTURE_LESSON_IDS.text && input[field] === value
  })
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body).toMatchObject({ ok: true, tracked: true, completed })
}

test('[QA:ACADEMY-PROGRESS] completes a fixture reading lesson and preserves course progress', async ({ page, baseURL }, info) => {
  test.setTimeout(180_000)
  info.annotations.push({ type: 'academy-source', description: 'Built-in text-only catalog. Progress uses the real app and development database.' })
  const tenant = createQaFixture(baseURL!)
  const coursePath = `/academy/${FIXTURE_COURSE_ID}`
  const lessonId = FIXTURE_LESSON_IDS.text
  const lessonPath = `${coursePath}/${lessonId}`
  const courseTitle = 'Getting started with Xtimator'
  const lessonTitle = 'Pricing tips (text only)'
  const main = page.getByRole('main')
  try {
    await tenant.seed()
    await page.context().addCookies(tenant.cookies())
    expect((await page.goto('/academy'))?.status()).toBe(200)
    await main.getByRole('link', { name: courseTitle, exact: true }).click()
    await expect(page).toHaveURL(new URL(coursePath, baseURL).href)
    await expect(main.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible()
    await expect(main.getByRole('progressbar', { name: 'Course progress' })).toHaveAttribute('aria-valuenow', '0')

    await Promise.all([
      waitForLessonTrack(page, 'event', 'lesson_open', false),
      main.getByRole('link', { name: /Pricing tips/ }).click(),
    ])
    await expect(page).toHaveURL(new URL(lessonPath, baseURL).href)
    await expect(main.getByRole('heading', { name: lessonTitle, exact: true })).toBeVisible()
    await expect(main.getByRole('heading', { name: 'Checklist', exact: true })).toBeVisible()
    expect((await tenant.readAcademyProgress(lessonId)).progress).toMatchObject({
      course_id: FIXTURE_COURSE_ID, completed_at: null, open_count: 1,
    })

    const complete = main.getByRole('button', { name: 'Mark as complete', exact: true })
    await Promise.all([waitForLessonTrack(page, 'completeSource', 'manual', true), complete.click()])
    await expect(complete).toHaveCount(0)
    const finished = await tenant.readAcademyProgress(lessonId)
    expect(finished.progress).toMatchObject({ course_id: FIXTURE_COURSE_ID, completed_at: expect.any(String) })
    expect(finished.events.filter(event => event.type === 'lesson_complete')).toEqual([
      { type: 'lesson_complete', payload: { source: 'manual' } },
    ])

    const [, reload] = await Promise.all([waitForLessonTrack(page, 'event', 'lesson_open', true), page.reload()])
    expect(reload?.status()).toBe(200)
    await expect(main.getByRole('heading', { name: lessonTitle, exact: true })).toBeVisible()
    await expect(main.getByText('Completed', { exact: true }).first()).toBeVisible()
    await expect(complete).toHaveCount(0)
    const reopened = await tenant.readAcademyProgress(lessonId)
    expect(reopened.progress).toMatchObject({ completed_at: finished.progress?.completed_at, open_count: 2 })
    expect(reopened.events.map(event => event.type)).toContain('lesson_reopen')
    expect(reopened.events.filter(event => event.type === 'lesson_complete')).toHaveLength(1)
    await main.getByRole('link', { name: courseTitle, exact: true }).click()
    await expect(page).toHaveURL(new URL(coursePath, baseURL).href)
    await expect(main.getByRole('progressbar', { name: 'Course progress' })).toHaveAttribute('aria-valuenow', '33')
    await expect(main.getByText('1/3 completed', { exact: true })).toBeVisible()
  } finally {
    try { await page.close() } finally { await tenant.cleanup() }
  }
})

test('[QA:KNOWLEDGE-OWNER] owns, edits and deletes an isolated knowledge entry', async ({ page, baseURL }, info) => {
  test.setTimeout(180_000)
  info.annotations.push({ type: 'knowledge-source', description: 'Seeded synthetic vector. The actual UI edits provenance only, without embedding requests.' })
  const owner = createQaFixture(baseURL!)
  const outsider = createQaFixture(baseURL!)
  const listPath = '/settings/knowledge'
  const detailPath = `${listPath}/${owner.knowledgeEntryId}`
  const source = 'QA revised provenance'
  const context = page.context()

  async function switchAccount(tenant: typeof owner) {
    await page.goto('about:blank')
    await context.clearCookies()
    await context.addCookies(tenant.cookies())
  }

  try {
    await owner.seed()
    await outsider.seed()
    await owner.seedKnowledgeEntry()
    const original = await owner.readKnowledgeEntry()
    expect(original).toMatchObject({ title: owner.knowledgeTitle, body: owner.knowledgeBody, source: 'QA initial source' })
    expect(original?.embedding).toBeTruthy()
    await context.addCookies(owner.cookies())
    expect((await page.goto(listPath))?.status()).toBe(200)
    const ownedLink = page.getByRole('link', { name: owner.knowledgeTitle, exact: true })
    await expect(ownedLink).toHaveAttribute('href', detailPath)
    await expect(page.getByRole('row').filter({ has: ownedLink }).getByText('Indexed', { exact: true })).toBeVisible()
    await ownedLink.click()
    await expect(page).toHaveURL(new URL(detailPath, baseURL).href)
    await expect(page.getByRole('heading', { name: 'Edit knowledge entry', exact: true })).toBeVisible()
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(owner.knowledgeTitle)
    await expect(page.getByLabel('Body', { exact: true })).toHaveValue(owner.knowledgeBody)
    await page.getByLabel('Source (optional)', { exact: true }).fill(source)
    await page.getByRole('button', { name: 'Save entry', exact: true }).click()
    await expect(page).toHaveURL(new URL(listPath, baseURL).href)
    expect(await owner.readKnowledgeEntry()).toEqual({ ...original, source })
    await ownedLink.click()
    await expect(page.getByLabel('Source (optional)', { exact: true })).toHaveValue(source)

    await switchAccount(outsider)
    const session = await page.request.get('/api/auth/session', { maxRedirects: 0 })
    expect(session.status()).toBe(200)
    expect((await session.json()).user?.id).toBe(outsider.userId)
    expect((await page.goto(listPath))?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'AI knowledge', exact: true })).toBeVisible()
    await expect(ownedLink).toHaveCount(0)
    expect([200, 404]).toContain((await page.goto(detailPath))?.status())
    await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible()
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
    await expect(page.getByText(owner.knowledgeTitle, { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Body', { exact: true })).toHaveCount(0)
    expect(await owner.readKnowledgeEntry()).toEqual({ ...original, source })

    await switchAccount(owner)
    expect((await page.goto(listPath))?.status()).toBe(200)
    const row = page.getByRole('row').filter({ has: ownedLink })
    const confirmDeletion = page.waitForEvent('dialog').then(async dialog => {
      expect(dialog.type()).toBe('confirm')
      expect(dialog.message()).toBe('Delete this entry? This cannot be undone.')
      await dialog.accept()
    })
    await Promise.all([confirmDeletion, row.getByRole('button', { name: 'Delete', exact: true }).click()])
    await expect(ownedLink).toHaveCount(0)
    expect(await owner.readKnowledgeEntry()).toBeNull()
  } finally {
    try { await page.close() } finally {
      const cleanup = await Promise.allSettled([owner.cleanup(), outsider.cleanup()])
      for (const result of cleanup) if (result.status === 'rejected') throw result.reason
    }
  }
})

test('[QA:IDENTITY-DENIAL] rejects invalid authorization and disabled invite and onboarding paths', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const tenant = createQaFixture(baseURL!)
  const origin = new URL(baseURL!).origin

  async function privateState(path: string, title: string, message: string) {
    expect((await page.goto(path))?.status()).toBe(200)
    await expect(page).toHaveURL(new URL(path, origin).href)
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
    await expect(page.getByText(message, { exact: true })).toBeVisible()
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
  }

  try {
    const clientId = randomUUID()
    const parameters = new URLSearchParams({ client_id: clientId, redirect_uri: 'https://example.invalid/callback',
      response_type: 'code', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' })
    await privateState('/oauth/authorize', 'Authorization error', 'Missing required parameter: client_id or redirect_uri.')
    await privateState(`/oauth/authorize?${parameters}`, 'Authorization error', `Unknown client_id: ${clientId}`)
    await expect(page.getByRole('button', { name: 'Authorize', exact: true })).toHaveCount(0)
    await privateState('/oauth/authorize/error?reason=invalid_client_or_redirect', 'Authorization error',
      'The client_id or redirect_uri is not valid for this authorization request.')
    await privateState('/invite/accept', 'Invite link', 'This invite link is missing its token.')

    await tenant.seed()
    await page.context().addCookies(tenant.cookies())
    const memberships = [{ company_id: tenant.companyId, role: 'owner' }]
    expect(await tenant.readMemberships()).toEqual(memberships)
    const nonexistentInvite = randomUUID()
    await privateState(`/invite/accept?token=${nonexistentInvite}`, "We couldn't accept this invite",
      'Joining a company by invite is not available yet. Ask the owner to contact support.')
    await expect(page.locator('body')).not.toContainText(nonexistentInvite)

    for (const path of ['/onboarding', '/onboarding?mode=add']) {
      await page.goto(path)
      await expect(page).toHaveURL(new URL('/dashboard', origin).href)
    }
    await page.goto('/update-password')
    await expect(page).toHaveURL(new URL('/settings/account', origin).href)
    expect(await tenant.readMemberships()).toEqual(memberships)
  } finally {
    try { await page.close() } finally { await tenant.cleanup() }
  }
})
