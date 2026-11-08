import { describe, it, expect } from 'vitest'
import { buildVisibleCatalog } from '@/lib/academy/visibility'
import type { RawCourse, RawLesson } from '@/lib/academy/types'

const course = (over: Partial<RawCourse> = {}): RawCourse => ({
  id: 'c1',
  title: 'Course',
  description: '',
  order: 1,
  published: true,
  apps: ['Xtimator'],
  language: 'en',
  group: '',
  ...over,
})

const lesson = (over: Partial<RawLesson> = {}): RawLesson => ({
  id: 'l1',
  courseId: 'c1',
  title: 'Lesson',
  order: 1,
  published: true,
  summary: '',
  videoUrl: null,
  format: 'auto',
  expectedMinutes: null,
  ...over,
})

const build = (courses: RawCourse[], lessons: RawLesson[], extra: { includeDrafts?: boolean } = {}) =>
  buildVisibleCatalog({ courses, lessons, app: 'Xtimator', ...extra })

describe('Academy visibility rule', () => {
  it('shows a published course for this app with a published lesson', () => {
    expect(build([course()], [lesson()])).toHaveLength(1)
  })

  it('hides everything when there is no content (no empty state)', () => {
    expect(build([], [])).toEqual([])
  })

  it('hides an unpublished course', () => {
    expect(build([course({ published: false })], [lesson()])).toEqual([])
  })

  it('hides a course that does not list this app', () => {
    expect(build([course({ apps: ['Xpot'] })], [lesson()])).toEqual([])
    expect(build([course({ apps: [] })], [lesson()])).toEqual([])
  })

  it('matches the app name case-insensitively', () => {
    expect(build([course({ apps: ['xtimator'] })], [lesson()])).toHaveLength(1)
  })

  it('hides a course with no published lesson', () => {
    expect(build([course()], [])).toEqual([])
    expect(build([course()], [lesson({ published: false })])).toEqual([])
  })

  it('ignores lessons without a course and lessons of another course', () => {
    expect(build([course()], [lesson({ courseId: null }), lesson({ id: 'l2', courseId: 'other' })])).toEqual([])
  })

  it('only counts published lessons and sorts by Order', () => {
    const [c] = build(
      [course()],
      [
        lesson({ id: 'b', order: 2, title: 'B' }),
        lesson({ id: 'draft', order: 0, published: false }),
        lesson({ id: 'a', order: 1, title: 'A' }),
      ],
    )
    expect(c.lessons.map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('sorts courses by Order', () => {
    const result = build(
      [course({ id: 'c2', order: 2 }), course({ id: 'c1', order: 1 })],
      [lesson({ courseId: 'c1' }), lesson({ id: 'l2', courseId: 'c2' })],
    )
    expect(result.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('shows drafts only when includeDrafts is on (dev)', () => {
    const draftCourse = course({ published: false })
    const draftLesson = lesson({ published: false })
    expect(build([draftCourse], [draftLesson])).toEqual([])
    expect(build([draftCourse], [draftLesson], { includeDrafts: true })).toHaveLength(1)
  })

  it('parses the YouTube id and keeps Format on the lesson', () => {
    const [c] = build(
      [course()],
      [lesson({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ', format: 'vertical' })],
    )
    expect(c.lessons[0].videoId).toBe('dQw4w9WgXcQ')
    expect(c.lessons[0].format).toBe('vertical')
  })
})
