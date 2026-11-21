import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveInterest, type InterestReason } from '@/lib/estimate/analytics/contracts'

/**
 * Client-side standing of each project's CURRENT estimate, for the Projects
 * list "Status" column. Status comes from the cheap counters on `estimates`
 * (view_count, last_viewed_at, sent_at, client_response, responded_at); the
 * Hot marker also folds in the company's latest 2000 client events (distinct
 * visitors, return days, signing, PDF), since counters alone never reach hot.
 *
 * Authenticated client only: RLS scopes `estimates` to the caller's company.
 *
 * The status rule is the same as `deriveEstimateStatus`
 * (components/workspace/editor-frame/estimate-status.tsx, a client module), kept
 * inline here so this file stays importable from server code.
 */

/** Only what the client did: no draft / shared state (owner decision 2026-11-21). */
export type EstimateListState = 'unopened' | 'viewed' | 'accepted' | 'declined'

export interface EstimateListStatus {
  state: EstimateListState
  /** Times the client opened the share page. */
  views: number
  lastViewedAt: string | null
  respondedAt: string | null
  /** Hot per deriveInterest (never true once the client answered). */
  hot: boolean
  hotReasons: InterestReason[]
  /** Newest client-side signal (open or answer); drives the activity sort. */
  lastActivityAt: string | null
  /** True when the client opened it and has not answered yet. */
  openedNoAnswer: boolean
}

export interface EstimateListRow {
  id?: string
  project_id: string
  sent_at: string | null
  view_count: number | null
  last_viewed_at: string | null
  client_response: string | null
  responded_at: string | null
}

/** Event-derived inputs for deriveInterest that the cheap counters lack. */
export interface EngagementSignals {
  uniqueVisitors: number
  distinctVisitDays: number
  signStarts: number
  pdfDownloads: number
  prints: number
}

export interface SignalEventRow {
  estimate_id: string
  visitor_id: string
  event_type: string
  created_at: string
}

/** Pure: fold raw engagement events into per-estimate signals. */
export function signalsFromEvents(events: SignalEventRow[]): Record<string, EngagementSignals> {
  const visitors = new Map<string, Set<string>>()
  const days = new Map<string, Set<string>>()
  const out: Record<string, EngagementSignals> = {}
  for (const ev of events) {
    const sig = (out[ev.estimate_id] ??= { uniqueVisitors: 0, distinctVisitDays: 0, signStarts: 0, pdfDownloads: 0, prints: 0 })
    if (ev.event_type === 'view') {
      if (!visitors.has(ev.estimate_id)) visitors.set(ev.estimate_id, new Set())
      if (!days.has(ev.estimate_id)) days.set(ev.estimate_id, new Set())
      visitors.get(ev.estimate_id)!.add(ev.visitor_id)
      days.get(ev.estimate_id)!.add(ev.created_at.slice(0, 10))
      sig.uniqueVisitors = visitors.get(ev.estimate_id)!.size
      sig.distinctVisitDays = days.get(ev.estimate_id)!.size
    } else if (ev.event_type === 'sign_start') sig.signStarts += 1
    else if (ev.event_type === 'pdf_download') sig.pdfDownloads += 1
    else if (ev.event_type === 'print') sig.prints += 1
  }
  return out
}

function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

/** Pure mapping of one estimate row to what the list shows. */
export function toEstimateListStatus(
  row: Pick<EstimateListRow, 'sent_at' | 'view_count' | 'last_viewed_at' | 'client_response' | 'responded_at'>,
  now: Date = new Date(),
  signals?: EngagementSignals,
): EstimateListStatus {
  const views = Math.max(0, Number(row.view_count) || 0)
  let state: EstimateListState = 'unopened'
  if (row.client_response === 'accepted') state = 'accepted'
  else if (row.client_response === 'declined') state = 'declined'
  else if (views > 0) state = 'viewed'

  const interest = deriveInterest({
    opens: views,
    lastViewedAt: row.last_viewed_at,
    clientResponse: row.client_response,
    now,
    ...signals,
  })
  const hot = interest.level === 'hot'

  return {
    state,
    views,
    lastViewedAt: row.last_viewed_at,
    respondedAt: row.responded_at,
    hot,
    hotReasons: hot ? interest.reasons.slice(0, 3) : [],
    lastActivityAt: laterOf(row.last_viewed_at, row.responded_at),
    openedNoAnswer: state === 'viewed',
  }
}

/** Pure: index rows by project. The first row per project wins. */
export function indexEstimateListStatuses(
  rows: EstimateListRow[],
  now: Date = new Date(),
  signals: Record<string, EngagementSignals> = {},
): Record<string, EstimateListStatus> {
  const out: Record<string, EstimateListStatus> = {}
  for (const row of rows) {
    if (!row.project_id || out[row.project_id]) continue
    out[row.project_id] = toEstimateListStatus(row, now, row.id ? signals[row.id] : undefined)
  }
  return out
}

/** Pure: attach the status to list rows as `estimate_status`. */
export function withEstimateStatus<T extends { id: string }>(
  projects: T[],
  statuses: Record<string, EstimateListStatus>,
): Array<T & { estimate_status?: EstimateListStatus }> {
  return projects.map((p) => (statuses[p.id] ? { ...p, estimate_status: statuses[p.id] } : p))
}

/** Current-version estimate counters for every project of the company. */
export async function getEstimateListStatuses(
  supabase: SupabaseClient,
  companyId: string,
): Promise<Record<string, EstimateListStatus>> {
  const [estimatesRes, eventsRes] = await Promise.all([
    supabase
      .from('estimates')
      .select('id, project_id, sent_at, view_count, last_viewed_at, client_response, responded_at')
      .eq('company_id', companyId)
      .eq('is_current', true),
    // Best effort: without these the counters alone rarely reach "hot".
    supabase
      .from('estimate_engagement_events')
      .select('estimate_id, visitor_id, event_type, created_at')
      .eq('company_id', companyId)
      .in('event_type', ['view', 'pdf_download', 'print', 'sign_start'])
      .order('created_at', { ascending: false })
      .limit(2000),
  ])
  if (estimatesRes.error) {
    console.error('[getEstimateListStatuses] supabase error', {
      companyId,
      code: estimatesRes.error.code,
      message: estimatesRes.error.message,
    })
    return {}
  }
  const signals = eventsRes.error ? {} : signalsFromEvents((eventsRes.data ?? []) as SignalEventRow[])
  return indexEstimateListStatuses((estimatesRes.data ?? []) as EstimateListRow[], new Date(), signals)
}
