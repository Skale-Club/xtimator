import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { getCatalog, getLessonMarkdown } from './catalog'
import { parseNotionMarkdown, wordCountOfNodes } from './notion-markdown'
import { parseStoredRanges } from './ranges'
import { buildExpectedByLesson, type ExpectedByLesson, type ProgressRow } from './stats'
import type { AcademyCourse } from './types'

const MAX_ROWS = 20_000

function mapRow(r: Record<string, unknown>): ProgressRow {
  return {
    userId: String(r.user_id),
    lessonId: String(r.lesson_id),
    courseId: String(r.course_id),
    completedAt: (r.completed_at as string | null) ?? null,
    activeSeconds: Number(r.active_seconds ?? 0),
    videoDurationSeconds: (r.video_duration_seconds as number | null) ?? null,
    videoWatchedRanges: parseStoredRanges(r.video_watched_ranges),
    videoWatchedSeconds: Number(r.video_watched_seconds ?? 0),
    maxScrollPct: Number(r.max_scroll_pct ?? 0),
    lastSeenAt: String(r.last_seen_at ?? ''),
    firstOpenedAt: String(r.first_opened_at ?? ''),
    openCount: Number(r.open_count ?? 0),
  }
}

export interface AcademyAdminData {
  courses: AcademyCourse[]
  rows: ProgressRow[]
  expected: ExpectedByLesson
  /** True when the academy tables do not exist yet (migration pending). */
  tablesMissing: boolean
}

/** Everything the overview and person pages need, in one pass. */
export async function loadAcademyAdminData(): Promise<AcademyAdminData> {
  const courses = await getCatalog()
  if (courses.length === 0) {
    return { courses, rows: [], expected: new Map(), tablesMissing: false }
  }

  const svc = requireServiceClient()
  const { data, error } = await svc
    .from('academy_lesson_progress')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .limit(MAX_ROWS)

  const tablesMissing =
    !!error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message))
  if (error && !tablesMissing) console.error('[academy] admin progress read failed:', error.message)
  const rows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>))

  // Body word counts feed the expected-time estimate (bodies are cached 10 min).
  const lessons = courses.flatMap((c) => c.lessons)
  const words = new Map<string, number>()
  await Promise.all(
    lessons.map(async (l) => {
      const md = await getLessonMarkdown(l.id)
      words.set(l.id, wordCountOfNodes(parseNotionMarkdown(md)))
    }),
  )

  return { courses, rows, expected: buildExpectedByLesson(courses, rows, words), tablesMissing }
}

export interface AcademyPerson {
  userId: string
  email: string
  companyName: string | null
}

/** Resolve emails and company names for a set of user ids (best effort). */
export async function resolvePeople(userIds: string[]): Promise<Map<string, AcademyPerson>> {
  const svc = requireServiceClient()
  const out = new Map<string, AcademyPerson>()
  const ids = [...new Set(userIds)]

  await Promise.all(
    ids.map(async (id) => {
      try {
        const { data } = await svc.auth.admin.getUserById(id)
        out.set(id, { userId: id, email: data.user?.email ?? id, companyName: null })
      } catch {
        out.set(id, { userId: id, email: id, companyName: null })
      }
    }),
  )

  if (ids.length > 0) {
    const { data: members } = await svc
      .from('company_members')
      .select('user_id, companies(name)')
      .in('user_id', ids)
    for (const m of (members ?? []) as Array<{ user_id: string; companies: { name?: string } | { name?: string }[] | null }>) {
      const person = out.get(m.user_id)
      if (!person || person.companyName) continue
      const company = Array.isArray(m.companies) ? m.companies[0] : m.companies
      if (company?.name) person.companyName = company.name
    }
  }
  return out
}

export interface AcademyEventRow {
  id: string
  courseId: string
  lessonId: string
  type: string
  payload: Record<string, unknown>
  createdAt: string
}

export async function loadUserEvents(userId: string, limit = 200): Promise<AcademyEventRow[]> {
  const { data, error } = await requireServiceClient()
    .from('academy_events')
    .select('id, course_id, lesson_id, type, payload, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data ?? []).map((e) => ({
    id: String(e.id),
    courseId: String(e.course_id),
    lessonId: String(e.lesson_id),
    type: String(e.type),
    payload: (e.payload as Record<string, unknown>) ?? {},
    createdAt: String(e.created_at),
  }))
}
