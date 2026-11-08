import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { parseStoredRanges, type WatchedRange } from './ranges'
import type { AcademyCourse } from './types'

export interface LessonProgress {
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

export function mapProgressRow(row: Record<string, unknown>): LessonProgress {
  return {
    lessonId: String(row.lesson_id),
    courseId: String(row.course_id),
    completedAt: (row.completed_at as string | null) ?? null,
    activeSeconds: Number(row.active_seconds ?? 0),
    videoDurationSeconds: (row.video_duration_seconds as number | null) ?? null,
    videoWatchedRanges: parseStoredRanges(row.video_watched_ranges),
    videoWatchedSeconds: Number(row.video_watched_seconds ?? 0),
    maxScrollPct: Number(row.max_scroll_pct ?? 0),
    lastSeenAt: String(row.last_seen_at ?? ''),
    firstOpenedAt: String(row.first_opened_at ?? ''),
    openCount: Number(row.open_count ?? 0),
  }
}

/**
 * All of one user's lesson progress, keyed by lesson id. A failed read (e.g. the
 * academy migration has not been applied yet) degrades to "no progress" - the
 * learner still sees the content.
 */
export async function getUserProgress(userId: string): Promise<Map<string, LessonProgress>> {
  const result = new Map<string, LessonProgress>()
  try {
    const { data, error } = await requireServiceClient()
      .from('academy_lesson_progress')
      .select('*')
      .eq('user_id', userId)
    if (error) {
      console.error('[academy] progress read failed:', error.message)
      return result
    }
    for (const row of data ?? []) {
      const p = mapProgressRow(row as Record<string, unknown>)
      result.set(p.lessonId, p)
    }
  } catch (error) {
    console.error('[academy] progress read failed:', error instanceof Error ? error.message : error)
  }
  return result
}

export interface CourseProgress {
  completed: number
  total: number
  percent: number
  /** First lesson not yet completed, or null when the course is done. */
  nextLessonId: string | null
  started: boolean
}

export function summariseCourse(
  course: AcademyCourse,
  progress: Map<string, LessonProgress>,
): CourseProgress {
  const total = course.lessons.length
  const completed = course.lessons.filter((l) => progress.get(l.id)?.completedAt).length
  const next = course.lessons.find((l) => !progress.get(l.id)?.completedAt) ?? null
  const started = course.lessons.some((l) => progress.has(l.id))
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    nextLessonId: next?.id ?? null,
    started,
  }
}
