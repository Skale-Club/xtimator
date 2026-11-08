import type { AcademyCourse } from './types'

/** Academy content languages, in display order. */
export const ACADEMY_LANGUAGES = ['en', 'pt', 'es'] as const
export type AcademyLanguage = (typeof ACADEMY_LANGUAGES)[number]

/** Interface language mirrored from the client (the app keeps it in localStorage); the only language control. */
export const ACADEMY_UI_LANG_COOKIE = 'academy_ui_lang'

export function isAcademyLanguage(value: unknown): value is AcademyLanguage {
  return typeof value === 'string' && (ACADEMY_LANGUAGES as readonly string[]).includes(value)
}

/** Notion `Language` select option -> code. Empty or unknown means English. */
export function parseCourseLanguage(name: string | null | undefined): AcademyLanguage {
  switch ((name ?? '').trim().toLowerCase()) {
    case 'português':
    case 'portugues':
    case 'portuguese':
      return 'pt'
    case 'español':
    case 'espanol':
    case 'spanish':
      return 'es'
    default:
      return 'en'
  }
}

/**
 * Pick one course per translation group: the requested language, else English,
 * else the first by Order. Courses with an empty group are their own group.
 */
export function resolveCatalogForLanguage(
  visibleCourses: AcademyCourse[],
  requested: AcademyLanguage | null | undefined,
): { courses: AcademyCourse[] } {
  const byOrder = (a: AcademyCourse, b: AcademyCourse) =>
    a.order - b.order || a.title.localeCompare(b.title)

  const groups = new Map<string, AcademyCourse[]>()
  for (const course of visibleCourses) {
    const key = course.group || course.id
    const list = groups.get(key) ?? []
    list.push(course)
    groups.set(key, list)
  }

  const picked: AcademyCourse[] = []
  for (const members of groups.values()) {
    const sorted = [...members].sort(byOrder)
    const choice =
      (requested ? sorted.find((c) => c.language === requested) : undefined) ??
      sorted.find((c) => c.language === 'en') ??
      sorted[0]
    picked.push(choice)
  }

  return { courses: picked.sort(byOrder) }
}

/** The requested Academy language is the interface language, else English. */
export function pickRequestedLanguage(ui: string | null | undefined): AcademyLanguage {
  return isAcademyLanguage(ui) ? ui : 'en'
}
