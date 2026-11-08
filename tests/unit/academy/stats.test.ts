import { describe, it, expect } from 'vitest'
import {
  buildExpectedByLesson,
  computeCourseStats,
  computePersonCourseStats,
  formatDuration,
  type ProgressRow,
} from '@/lib/academy/stats'
import type { AcademyCourse, AcademyLesson } from '@/lib/academy/types'

const lesson = (id: string, over: Partial<AcademyLesson> = {}): AcademyLesson => ({
  id,
  courseId: 'c1',
  title: id,
  order: 1,
  summary: '',
  videoUrl: null,
  videoId: null,
  format: 'auto',
  expectedMinutes: null,
  ...over,
})

const course: AcademyCourse = {
  id: 'c1',
  title: 'Course',
  description: '',
  order: 1,
  language: 'en',
  group: '',
  lessons: [lesson('l1'), lesson('l2', { videoId: 'dQw4w9WgXcQ' }), lesson('l3')],
}

const row = (userId: string, lessonId: string, over: Partial<ProgressRow> = {}): ProgressRow => ({
  userId,
  lessonId,
  courseId: 'c1',
  completedAt: null,
  activeSeconds: 0,
  videoDurationSeconds: null,
  videoWatchedRanges: [],
  videoWatchedSeconds: 0,
  maxScrollPct: 0,
  lastSeenAt: '2026-11-01T10:00:00Z',
  firstOpenedAt: '2026-11-01T09:00:00Z',
  openCount: 1,
  ...over,
})

describe('computeCourseStats', () => {
  const done = '2026-11-01T11:00:00Z'
  const rows: ProgressRow[] = [
    // ana finished everything
    row('ana', 'l1', { completedAt: done }),
    row('ana', 'l2', { completedAt: done }),
    row('ana', 'l3', { completedAt: done }),
    // bob completed l1, opened l2 and stopped there
    row('bob', 'l1', { completedAt: done }),
    row('bob', 'l2'),
    // cy only opened l1
    row('cy', 'l1'),
  ]

  it('counts enrolled, completed and completion percent', () => {
    const stats = computeCourseStats(course, rows)
    expect(stats.enrolled).toBe(3)
    expect(stats.completed).toBe(1)
    expect(stats.completionPercent).toBe(33)
  })

  it('finds where people stop (drop-off per lesson)', () => {
    const stats = computeCourseStats(course, rows)
    const byId = Object.fromEntries(stats.lessons.map((l) => [l.lesson.id, l]))
    expect(byId.l1).toMatchObject({ opened: 3, completed: 2, stoppedHere: 1 }) // cy
    expect(byId.l2).toMatchObject({ opened: 2, completed: 1, stoppedHere: 1 }) // bob
    expect(byId.l3).toMatchObject({ opened: 1, completed: 1, stoppedHere: 0 })
  })

  it('is empty-safe', () => {
    const stats = computeCourseStats(course, [])
    expect(stats).toMatchObject({ enrolled: 0, completed: 0, completionPercent: 0 })
  })
})

describe('expected time and person stats', () => {
  it('derives expected time from any viewer video duration plus body words', () => {
    const rows = [row('a', 'l2', { videoDurationSeconds: 120 }), row('b', 'l2', { videoDurationSeconds: 100 })]
    const expected = buildExpectedByLesson([course], rows, new Map([['l2', 400], ['l1', 200]]))
    expect(expected.get('l2')).toBe(240) // 120 s video + 400 words / 200 wpm
    expect(expected.get('l1')).toBe(60)
  })

  it('prefers authored Expected minutes', () => {
    const c: AcademyCourse = { ...course, lessons: [lesson('l1', { expectedMinutes: 5 })] }
    expect(buildExpectedByLesson([c], [], new Map([['l1', 9999]])).get('l1')).toBe(300)
  })

  it('flags a person who completed too fast and reports course percent and last access', () => {
    const done = '2026-11-02T11:00:00Z'
    const userRows = [
      row('u', 'l1', { completedAt: done, activeSeconds: 5, lastSeenAt: '2026-11-02T11:00:00Z' }),
      row('u', 'l2', {
        completedAt: done,
        activeSeconds: 300,
        videoDurationSeconds: 100,
        videoWatchedRanges: [[0, 20]],
      }),
    ]
    const expected = new Map([['l1', 100], ['l2', 120], ['l3', 60]])
    const stats = computePersonCourseStats(course, userRows, expected)

    expect(stats.percentComplete).toBe(67)
    expect(stats.lastAccess).toBe('2026-11-02T11:00:00Z')
    expect(stats.lessons[0].tooFast).toBe(true) // 5 s of 100 s expected
    expect(stats.lessons[1].tooFast).toBe(true) // only 20% of the video watched
    expect(stats.lessons[1].videoWatchedPercent).toBe(20)
    expect(stats.lessons[2].row).toBeNull()
    expect(stats.tooFastCount).toBe(2)
  })

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(125)).toBe('2m 05s')
    expect(formatDuration(3720)).toBe('1h 02m')
  })
})
