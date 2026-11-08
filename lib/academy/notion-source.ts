import 'server-only'
import { Client } from '@notionhq/client'
import { parseFormat } from './video'
import { parseCourseLanguage } from './language'
import type { ContentSource, RawCourse, RawLesson } from './types'

/** The markdown endpoint requires this Notion-Version (spec section 1). */
export const NOTION_VERSION = '2026-03-11'
const REQUEST_TIMEOUT_MS = 8_000

type Props = Record<string, unknown>

// ---------------------------------------------------------------------------
// Property readers. Notion property values are a wide union; we read them
// defensively by shape so a renamed or missing property degrades to a default
// instead of throwing.
// ---------------------------------------------------------------------------

function prop(props: Props, name: string): Record<string, unknown> | null {
  const value = props[name]
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function richTextToString(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value
    .map((item) => (item && typeof item === 'object' ? String((item as { plain_text?: string }).plain_text ?? '') : ''))
    .join('')
}

export function readTitle(props: Props, name: string): string {
  return richTextToString(prop(props, name)?.title).trim()
}

export function readRichText(props: Props, name: string): string {
  return richTextToString(prop(props, name)?.rich_text).trim()
}

export function readCheckbox(props: Props, name: string): boolean {
  return prop(props, name)?.checkbox === true
}

export function readNumber(props: Props, name: string): number | null {
  const n = prop(props, name)?.number
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export function readUrl(props: Props, name: string): string | null {
  const u = prop(props, name)?.url
  return typeof u === 'string' && u.trim() ? u.trim() : null
}

export function readSelect(props: Props, name: string): string | null {
  const sel = prop(props, name)?.select as { name?: string } | null | undefined
  return sel?.name ?? null
}

export function readMultiSelect(props: Props, name: string): string[] {
  const list = prop(props, name)?.multi_select
  if (!Array.isArray(list)) return []
  return list.map((o) => String((o as { name?: string }).name ?? '')).filter(Boolean)
}

export function readRelationIds(props: Props, name: string): string[] {
  const list = prop(props, name)?.relation
  if (!Array.isArray(list)) return []
  return list.map((o) => String((o as { id?: string }).id ?? '')).filter(Boolean)
}

export function mapCourseRow(id: string, props: Props): RawCourse {
  return {
    id,
    title: readTitle(props, 'Name'),
    description: readRichText(props, 'Description'),
    order: readNumber(props, 'Order') ?? 0,
    published: readCheckbox(props, 'Published'),
    apps: readMultiSelect(props, 'Apps'),
    language: parseCourseLanguage(readSelect(props, 'Language')),
    group: readRichText(props, 'Group'),
  }
}

export function mapLessonRow(id: string, props: Props): RawLesson {
  return {
    id,
    courseId: readRelationIds(props, 'Course')[0] ?? null,
    title: readTitle(props, 'Name'),
    order: readNumber(props, 'Order') ?? 0,
    published: readCheckbox(props, 'Published'),
    summary: readRichText(props, 'Summary'),
    videoUrl: readUrl(props, 'Video'),
    format: parseFormat(readSelect(props, 'Format')),
    expectedMinutes: readNumber(props, 'Expected minutes'),
  }
}

// ---------------------------------------------------------------------------

export function createNotionSource(config: {
  token: string
  coursesDbId: string
  lessonsDbId: string
}): ContentSource {
  const notion = new Client({
    auth: config.token,
    notionVersion: NOTION_VERSION,
    timeoutMs: REQUEST_TIMEOUT_MS,
  })

  // database id -> data source id (stable, so cached for the process lifetime).
  const dataSourceIds = new Map<string, string>()

  async function resolveDataSourceId(databaseId: string): Promise<string> {
    const cached = dataSourceIds.get(databaseId)
    if (cached) return cached
    const db = await notion.databases.retrieve({ database_id: databaseId })
    const id = 'data_sources' in db ? db.data_sources[0]?.id : undefined
    if (!id) throw new Error(`Notion database ${databaseId} has no data source`)
    dataSourceIds.set(databaseId, id)
    return id
  }

  /** All page rows of a database as [id, properties]; filtering happens in code. */
  async function queryAll(databaseId: string): Promise<Array<[string, Props]>> {
    const dataSourceId = await resolveDataSourceId(databaseId)
    const rows: Array<[string, Props]> = []
    let cursor: string | undefined
    // Hard stop at 10 pages (1000 rows): an Academy is tens of rows, never more.
    for (let page = 0; page < 10; page++) {
      const res = await notion.dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
        page_size: 100,
      })
      for (const row of res.results) {
        if (row.object === 'page' && 'properties' in row) {
          rows.push([row.id, row.properties as unknown as Props])
        }
      }
      if (!res.has_more || !res.next_cursor) break
      cursor = res.next_cursor
    }
    return rows
  }

  return {
    kind: 'notion',
    async loadRaw() {
      const [courseRows, lessonRows] = await Promise.all([
        queryAll(config.coursesDbId),
        queryAll(config.lessonsDbId),
      ])
      return {
        courses: courseRows.map(([id, props]) => mapCourseRow(id, props)),
        lessons: lessonRows.map(([id, props]) => mapLessonRow(id, props)),
      }
    },
    async getLessonMarkdown(lessonId) {
      const res = await notion.pages.retrieveMarkdown({ page_id: lessonId })
      return res.markdown
    },
  }
}
