import { expectedSeconds, isTooFast } from './expected-time'
import { watchedFraction, type WatchedRange } from './ranges'
import type { AcademyCourse, AcademyLesson } from './types'

/** The slice of a progress row the dashboard needs (user-keyed). */
export interface ProgressRow {
  userId: string
  lessonId: string
  courseId: string
  completedAt: string | null
  activeSeconds: number
  videoDurationSeconds: number | null
  videoWatchedRanges: WatchedRange[]
  videoWatchedSeconds: number
  maxScrollPct: number
  lastSeenAt: string
  firstOpenedAt: string
  openCount: number
}

/** Per-lesson expected seconds, resolved once per dashboard render. */
export type ExpectedByLesson = Map<string, number>

/**
 * Expected time per lesson: `Expected minutes` when authored, else the longest
 * video duration any viewer's progress row reported plus body reading time.
 */
export function buildExpectedByLesson(
  courses: AcademyCourse[],
  rows: ProgressRow[],
  wordsByLesson: Map<string, number>,
): ExpectedByLesson {
  const durationByLesson = new Map<string, number>()
  for (const r of rows) {
    if (r.videoDurationSeconds && r.videoDurationSeconds > (durationByLesson.get(r.lessonId) ?? 0)) {
      durationByLesson.set(r.lessonId, r.videoDurationSeconds)
    }
  }
  const out: ExpectedByLesson = new Map()
  for (const course of courses) {
    for (const lesson of course.lessons) {
      out.set(
        lesson.id,
        expectedSeconds({
          expectedMinutes: lesson.expectedMinutes,
          videoDurationSeconds: durationByLesson.get(lesson.id) ?? null,
          bodyWords: wordsByLesson.get(lesson.id) ?? 0,
        }),
      )
    }
  }
  return out
}

export interface LessonDropoff {
  lesson: AcademyLesson
  opened: number
  completed: number
  /** Opened, not completed, and never opened any later lesson of the course. */
  stoppedHere: number
}

export interface CourseStats {
  course: AcademyCourse
  enrolled: number
  completed: number
  completionPercent: number
  lessons: LessonDropoff[]
}

export function computeCourseStats(course: AcademyCourse, rows: ProgressRow[]): CourseStats {
  const lessonIds = new Set(course.lessons.map((l) => l.id))
  const courseRows = rows.filter((r) => lessonIds.has(r.lessonId))

  const byUser = new Map<string, Map<string, ProgressRow>>()
  for (const r of courseRows) {
    const m = byUser.get(r.userId) ?? new Map<string, ProgressRow>()
    m.set(r.lessonId, r)
    byUser.set(r.userId, m)
  }

  let completedUsers = 0
  for (const lessons of byUser.values()) {
    if (course.lessons.every((l) => lessons.get(l.id)?.completedAt)) completedUsers++
  }

  const lessons: LessonDropoff[] = course.lessons.map((lesson, index) => {
    let opened = 0
    let completed = 0
    let stoppedHere = 0
    for (const userLessons of byUser.values()) {
      const mine = userLessons.get(lesson.id)
      if (!mine) continue
      opened++
      if (mine.completedAt) {
        completed++
        continue
      }
      const reachedLater = course.lessons.slice(index + 1).some((l) => userLessons.has(l.id))
      if (!reachedLater) stoppedHere++
    }
    return { lesson, opened, completed, stoppedHere }
  })

  const enrolled = byUser.size
  return {
    course,
    enrolled,
    completed: completedUsers,
    completionPercent: enrolled === 0 ? 0 : Math.round((completedUsers / enrolled) * 100),
    lessons,
  }
}

export interface PersonLessonBreakdown {
  lesson: AcademyLesson
  row: ProgressRow | null
  expectedSeconds: number
  videoWatchedPercent: number | null
  tooFast: boolean
}

export interface PersonCourseStats {
  course: AcademyCourse
  percentComplete: number
  completedLessons: number
  activeSeconds: number
  expectedSeconds: number
  lastAccess: string | null
  tooFastCount: number
  lessons: PersonLessonBreakdown[]
}

export function computePersonCourseStats(
  course: AcademyCourse,
  userRows: ProgressRow[],
  expected: ExpectedByLesson,
): PersonCourseStats {
  const byLesson = new Map(userRows.map((r) => [r.lessonId, r]))
  let activeSeconds = 0
  let expectedTotal = 0
  let completedLessons = 0
  let tooFastCount = 0
  let lastAccess: string | null = null

  const lessons = course.lessons.map((lesson): PersonLessonBreakdown => {
    const row = byLesson.get(lesson.id) ?? null
    const exp = expected.get(lesson.id) ?? 0
    const hasVideo = !!lesson.videoId
    const fraction =
      row && hasVideo
        ? watchedFraction(row.videoWatchedRanges, row.videoDurationSeconds)
        : null
    const tooFast = row
      ? isTooFast({
          completed: !!row.completedAt,
          activeSeconds: row.activeSeconds,
          expectedSeconds: exp,
          videoWatchedFraction: fraction,
        })
      : false

    if (row) {
      activeSeconds += row.activeSeconds
      if (row.completedAt) completedLessons++
      if (!lastAccess || row.lastSeenAt > lastAccess) lastAccess = row.lastSeenAt
    }
    expectedTotal += exp
    if (tooFast) tooFastCount++

    return {
      lesson,
      row,
      expectedSeconds: exp,
      videoWatchedPercent: fraction == null ? null : Math.round(fraction * 100),
      tooFast,
    }
  })

  return {
    course,
    percentComplete:
      course.lessons.length === 0 ? 0 : Math.round((completedLessons / course.lessons.length) * 100),
    completedLessons,
    activeSeconds,
    expectedSeconds: expectedTotal,
    lastAccess,
    tooFastCount,
    lessons,
  }
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** Expected time: 0 means "unknown", shown as a dash rather than "0s". */
export function formatExpectedDuration(totalSeconds: number): string {
  return Math.round(totalSeconds) > 0 ? formatDuration(totalSeconds) : '—'
}
