import { parseYouTubeId } from './video'
import type { AcademyCourse, RawCourse, RawLesson } from './types'

/**
 * The visibility rule (spec section 2): a course is visible only when it is
 * Published, its `Apps` contains this app, and it has at least one Published
 * lesson. Anything else is simply absent - no empty states anywhere.
 *
 * `includeDrafts` is a dev-only escape hatch (ACADEMY_INCLUDE_DRAFTS) and is
 * never honoured in production by the caller.
 */
export function buildVisibleCatalog(input: {
  courses: RawCourse[]
  lessons: RawLesson[]
  app: string
  includeDrafts?: boolean
}): AcademyCourse[] {
  const { courses, lessons, app, includeDrafts = false } = input
  const wantedApp = app.trim().toLowerCase()

  const lessonsByCourse = new Map<string, RawLesson[]>()
  for (const lesson of lessons) {
    if (!lesson.courseId) continue
    if (!lesson.published && !includeDrafts) continue
    const list = lessonsByCourse.get(lesson.courseId) ?? []
    list.push(lesson)
    lessonsByCourse.set(lesson.courseId, list)
  }

  const visible: AcademyCourse[] = []
  for (const course of courses) {
    if (!course.published && !includeDrafts) continue
    if (!course.apps.some((a) => a.trim().toLowerCase() === wantedApp)) continue
    const own = lessonsByCourse.get(course.id) ?? []
    if (own.length === 0) continue

    visible.push({
      id: course.id,
      title: course.title,
      description: course.description,
      order: course.order,
      language: course.language,
      group: course.group,
      lessons: [...own]
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
        .map((l) => ({
          id: l.id,
          courseId: course.id,
          title: l.title,
          order: l.order,
          summary: l.summary,
          videoUrl: l.videoUrl,
          videoId: parseYouTubeId(l.videoUrl),
          format: l.format,
          expectedMinutes: l.expectedMinutes,
        })),
    })
  }

  return visible.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
}
