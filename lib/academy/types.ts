import type { VideoFormat } from './video'
import type { AcademyLanguage } from './language'

/** App identity used by the Notion `Apps` multi-select filter. */
export const ACADEMY_APP_NAME = 'Xtimator'

/** A course row as read from the content source (before the visibility rule). */
export interface RawCourse {
  id: string
  title: string
  description: string
  order: number
  published: boolean
  apps: string[]
  /** Content language (Notion `Language`); empty or unknown is `en`. */
  language: AcademyLanguage
  /** Translations of one course share a Group; empty means the course stands alone. */
  group: string
}

/** A lesson row as read from the content source (before the visibility rule). */
export interface RawLesson {
  id: string
  courseId: string | null
  title: string
  order: number
  published: boolean
  summary: string
  videoUrl: string | null
  format: VideoFormat
  expectedMinutes: number | null
}

export interface AcademyLesson {
  id: string
  courseId: string
  title: string
  order: number
  summary: string
  videoUrl: string | null
  /** 11-char YouTube id parsed from `videoUrl`, null when absent or unparseable. */
  videoId: string | null
  format: VideoFormat
  expectedMinutes: number | null
}

export interface AcademyCourse {
  id: string
  title: string
  description: string
  order: number
  language: AcademyLanguage
  group: string
  lessons: AcademyLesson[]
}

/**
 * Where Academy content comes from. Two implementations: `notion` (the real
 * thing) and `fixture` (dev-only, see lib/academy/fixture-source.ts).
 */
export interface ContentSource {
  readonly kind: 'notion' | 'fixture'
  /** Every course and lesson row, drafts included; the visibility rule runs later. */
  loadRaw(): Promise<{ courses: RawCourse[]; lessons: RawLesson[] }>
  /** Lesson body as Notion-flavored markdown. */
  getLessonMarkdown(lessonId: string): Promise<string>
}
