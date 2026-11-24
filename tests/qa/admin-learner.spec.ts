import type { Page } from '@playwright/test'
import { FIXTURE_COURSE_ID, FIXTURE_LESSON_IDS } from '../../lib/academy/fixture-source'
import { createQaFixture } from './fixtures/tenant'
import { expect, test } from './test'

test.use({ trace: 'off', video: 'off', screenshot: 'off' })

const lessonId = FIXTURE_LESSON_IDS.text
const lessonTitle = 'Pricing tips (text only)'
const lessonRoute = `/academy/${FIXTURE_COURSE_ID}/${lessonId}`

async function observeLessonTrack(page: Page, field: 'event' | 'completeSource', value: string, completed: boolean) {
  const response = await page.waitForResponse(candidate => {
    const request = candidate.request()
    if (new URL(candidate.url()).pathname !== '/api/academy/track' || request.method() !== 'POST') return false
    const input = request.postDataJSON()
    return input?.courseId === FIXTURE_COURSE_ID && input.lessonId === lessonId && input[field] === value
  })
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body?.ok === true && body.tracked === true && body.completed === completed).toBe(true)
}

test('[QA:ADM-LEARNER-DETAIL] an administrator reads the synthetic learner’s persisted completion', async ({ context, baseURL }, info) => {
  test.setTimeout(180_000)
  const learner = createQaFixture(baseURL!)
  const admin = createQaFixture(baseURL!, { platformAdmin: true })
  const origin = new URL(baseURL!).origin
  const evidence = { routes: ['/academy/[courseId]/[lessonId]', '/admin/academy/[userId]'],
    manualCompletion: false, adminView: false, stableAfterReload: false, pageErrors: 0, serverErrors: 0 }
  const watchErrors = (page: Page) => {
    page.on('pageerror', () => { evidence.pageErrors++ })
    page.on('response', response => {
      if (new URL(response.url()).origin === origin && response.status() >= 500) evidence.serverErrors++
    })
  }

  try {
    await learner.seed()
    await admin.seed()
    await context.addCookies(learner.cookies())
    const learnerPage = await context.newPage()
    watchErrors(learnerPage)
    const [, lesson] = await Promise.all([
      observeLessonTrack(learnerPage, 'event', 'lesson_open', false),
      learnerPage.goto(lessonRoute),
    ])
    expect(lesson?.status()).toBe(200)
    await expect(learnerPage.getByRole('heading', { level: 1, name: lessonTitle, exact: true })).toBeVisible()
    await Promise.all([
      observeLessonTrack(learnerPage, 'completeSource', 'manual', true),
      learnerPage.getByRole('button', { name: 'Mark as complete', exact: true }).click(),
    ])
    const persisted = await learner.readAcademyProgress(lessonId)
    expect(persisted.progress?.course_id === FIXTURE_COURSE_ID && typeof persisted.progress.completed_at === 'string').toBe(true)
    expect(persisted.events.filter(event => event.type === 'lesson_complete').map(event => event.payload)).toEqual([{ source: 'manual' }])
    evidence.manualCompletion = true

    await learnerPage.close()
    await context.clearCookies()
    await context.addCookies(admin.cookies())
    const screen = await context.newPage()
    watchErrors(screen)
    const path = `/admin/academy/${learner.userId}`
    const main = screen.getByRole('main')

    async function verifyDetail() {
      await expect.poll(() => new URL(screen.url()).pathname === path).toBe(true)
      expect((await screen.getByText(/^Super Admin Mode - /).innerText()).trim() === `Super Admin Mode - ${admin.userEmail}`).toBe(true)
      const heading = main.getByRole('heading', { level: 1 })
      await expect(heading).toBeVisible()
      expect((await heading.innerText()).trim() === learner.userEmail).toBe(true)
      const company = heading.locator('..').getByRole('paragraph')
      expect((await company.innerText()).trim() === learner.companyName).toBe(true)
      const course = main.locator('section').filter({ has: screen.getByRole('heading', { name: 'Getting started with Xtimator', exact: true }) })
      await expect(course.getByText(/^33% complete\b/)).toBeVisible()
      const lesson = course.getByRole('row').filter({ has: screen.getByText(`3. ${lessonTitle}`, { exact: true }) })
      await expect(lesson).toBeVisible()
      const completion = (await lesson.getByRole('cell').nth(5).innerText()).trim()
      expect(completion.length > 0 && completion !== '-').toBe(true)

      const timeline = main.locator('section').filter({ has: screen.getByRole('heading', { name: 'Timeline', exact: true }) })
      const completed = timeline.getByRole('listitem').filter({ has: screen.getByText('lesson_complete', { exact: true }) })
      await expect(completed).toHaveCount(1)
      await expect(completed.getByText(lessonTitle, { exact: true })).toBeVisible()
      return completion
    }

    const detail = await screen.goto(path).catch(() => { throw new Error('Could not navigate to the synthetic learner detail') })
    expect(detail?.status()).toBe(200)
    const completion = await verifyDetail()
    evidence.adminView = true
    const reload = await screen.reload().catch(() => { throw new Error('Could not reload the synthetic learner detail') })
    expect(reload?.status()).toBe(200)
    expect(await verifyDetail() === completion).toBe(true)
    evidence.stableAfterReload = true
    await screen.close()
    expect(evidence.pageErrors).toBe(0)
    expect(evidence.serverErrors).toBe(0)
  } finally {
    const closes = await Promise.allSettled(context.pages().map(page => page.close()))
    const cleanups = await Promise.allSettled([learner.cleanup(), admin.cleanup()])
    await info.attach('admin-learner-evidence.json', {
      body: JSON.stringify(evidence), contentType: 'application/json',
    })
    for (const result of [...closes, ...cleanups]) if (result.status === 'rejected') throw result.reason
  }
})
