import 'server-only'
import { getAcademyNotionConfig } from '@/lib/platform-config'
import { createFixtureSource } from './fixture-source'
import { resolveCatalogForLanguage, type AcademyLanguage } from './language'
import { createNotionSource } from './notion-source'
import { createSwrCache } from './swr-cache'
import { ACADEMY_APP_NAME, type AcademyCourse, type AcademyLesson, type ContentSource } from './types'
import { aspectFromSize, resolveAspect, type Aspect } from './video'
import { buildVisibleCatalog } from './visibility'

/** Availability / catalog is cached ~5 minutes so publishing in Notion shows up without a deploy. */
const CATALOG_TTL_MS = 5 * 60 * 1000
/** After a failed first load, retry no sooner than this. */
const ERROR_TTL_MS = 60 * 1000
/** Rendered lesson markdown contains pre-signed URLs (~1h) - never cache past ~10 minutes. */
const LESSON_TTL_MS = 10 * 60 * 1000
/** Aspect detection is stable per video. */
const OEMBED_TTL_MS = 24 * 60 * 60 * 1000

const catalogCache = createSwrCache<AcademyCourse[]>({ ttlMs: CATALOG_TTL_MS, errorTtlMs: ERROR_TTL_MS })
const lessonCache = createSwrCache<string>({ ttlMs: LESSON_TTL_MS })
const oembedCache = createSwrCache<{ width: number; height: number } | null>({ ttlMs: OEMBED_TTL_MS })

function nonProduction(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/** Fixtures are dev-only: never in production, whatever the env says. */
export function fixturesEnabled(): boolean {
  return nonProduction() && process.env.ACADEMY_FIXTURES === '1'
}

function draftsEnabled(): boolean {
  return nonProduction() && process.env.ACADEMY_INCLUDE_DRAFTS === '1'
}

async function getSource(): Promise<ContentSource | null> {
  if (fixturesEnabled()) return createFixtureSource()
  const config = await getAcademyNotionConfig()
  return config ? createNotionSource(config) : null
}

/**
 * Every visible course for this app. ANY failure (not configured, Notion down,
 * bad token...) is logged server-side and treated as "no courses" - the user
 * never sees an error and the entry point simply stays hidden.
 */
export async function getCatalog(): Promise<AcademyCourse[]> {
  try {
    return await catalogCache.get(
      'catalog',
      async () => {
        try {
          const source = await getSource()
          if (!source) return []
          const raw = await source.loadRaw()
          return buildVisibleCatalog({
            ...raw,
            app: ACADEMY_APP_NAME,
            includeDrafts: draftsEnabled(),
          })
        } catch (error) {
          console.error(
            '[academy] catalog load failed:',
            error instanceof Error ? error.message : error,
          )
          throw error
        }
      },
      [],
    )
  } catch (error) {
    console.error('[academy] catalog unavailable, hiding Academy:', error instanceof Error ? error.message : error)
    return []
  }
}

/**
 * The catalog as one person should see it: one course per translation group,
 * in their language when it exists (else English, else any). Course and lesson
 * lookups below stay language-agnostic so shared links always work.
 */
export async function getCatalogForLanguage(requested: AcademyLanguage | null) {
  return resolveCatalogForLanguage(await getCatalog(), requested)
}

/** Drop cached catalog / lesson bodies (called when the Notion config changes). */
export function invalidateAcademyCache(): void {
  catalogCache.clear()
  lessonCache.clear()
}

/** True when at least one course is visible. Never throws. */
export async function isAcademyAvailable(): Promise<boolean> {
  return (await getCatalog()).length > 0
}

export async function getCourse(courseId: string): Promise<AcademyCourse | null> {
  return (await getCatalog()).find((c) => c.id === courseId) ?? null
}

export async function getLesson(
  courseId: string,
  lessonId: string,
): Promise<{ course: AcademyCourse; lesson: AcademyLesson; index: number } | null> {
  const course = await getCourse(courseId)
  if (!course) return null
  const index = course.lessons.findIndex((l) => l.id === lessonId)
  if (index === -1) return null
  return { course, lesson: course.lessons[index], index }
}

/** Lesson body markdown; empty string when it cannot be loaded. */
export async function getLessonMarkdown(lessonId: string): Promise<string> {
  try {
    return await lessonCache.get(lessonId, async () => {
      const source = await getSource()
      return source ? source.getLessonMarkdown(lessonId) : ''
    })
  } catch (error) {
    console.error('[academy] lesson body unavailable:', error instanceof Error ? error.message : error)
    return ''
  }
}

async function fetchOembed(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(4_000) },
    )
    if (!res.ok) return null
    const json = (await res.json()) as { width?: number; height?: number }
    if (typeof json.width !== 'number' || typeof json.height !== 'number') return null
    return aspectFromSize(json.width, json.height) ? { width: json.width, height: json.height } : null
  } catch {
    return null
  }
}

/** Per-video aspect: Format override, else oEmbed detection (cached), else vertical. */
export async function getVideoAspect(lesson: AcademyLesson): Promise<Aspect> {
  if (!lesson.videoUrl) return 'vertical'
  if (lesson.format !== 'auto') return resolveAspect({ format: lesson.format, url: lesson.videoUrl })
  const url = lesson.videoUrl
  let oembed: { width: number; height: number } | null = null
  try {
    oembed = await oembedCache.get(url, () => fetchOembed(url))
  } catch {
    oembed = null
  }
  return resolveAspect({ format: lesson.format, url, oembed })
}
