import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveInterest } from '@/lib/estimate/analytics/contracts'
import { signalsFromEvents, type EngagementSignals } from '@/lib/queries/estimate-list-status'

/**
 * Dashboard "Client activity": what clients did with the estimates lately
 * (opened the share page, downloaded or printed the PDF, started signing,
 * accepted or declined), newest first, across the active company.
 *
 * Authenticated client only: RLS on estimate_engagement_events, estimate_activity
 * and estimates scopes every read to the caller's company. Never pass the
 * service client in.
 */

export type ClientActivityKind =
  | 'opened'
  | 'pdf_download'
  | 'sign_start'
  | 'print'
  | 'accepted'
  | 'declined'

export interface ClientActivityRow {
  id: string
  kind: ClientActivityKind
  at: string
  estimateId: string
  projectId: string
  projectName: string
  clientName: string | null
  device: 'mobile' | 'desktop' | null
  /** The estimate is hot right now (deriveInterest on its counters). */
  hot: boolean
  /** Opens of the same estimate on the same day, folded into this row (>= 1). */
  count: number
}

export interface ClientActivityEventRow {
  id: string
  estimate_id: string
  session_id: string
  visitor_id?: string
  event_type: string
  device: 'mobile' | 'desktop' | null
  created_at: string
}

export interface ClientActivityResponseRow {
  id: string
  estimate_id: string | null
  event_type: string
  created_at: string
  metadata: Record<string, unknown> | null
}

export interface ClientActivityEstimate {
  projectId: string
  projectName: string
  clientName: string | null
  viewCount: number
  lastViewedAt: string | null
  clientResponse: string | null
}

const EVENT_KIND: Record<string, ClientActivityKind | undefined> = {
  view: 'opened',
  pdf_download: 'pdf_download',
  sign_start: 'sign_start',
  print: 'print',
}

const RESPONSE_KIND: Record<string, ClientActivityKind | undefined> = {
  estimate_accepted: 'accepted',
  estimate_declined: 'declined',
}

/**
 * Pure: merge engagement events and client answers into one newest-first list.
 *  - one "opened" row per visit (session); one row per (session, action);
 *  - answers the owner recorded by hand (metadata.source = 'manual') are not
 *    client activity and are skipped;
 *  - rows whose estimate is unknown (deleted project) are dropped.
 */
export function buildClientActivity(input: {
  events: ClientActivityEventRow[]
  responses: ClientActivityResponseRow[]
  estimates: Record<string, ClientActivityEstimate>
  limit?: number
  now?: Date
}): ClientActivityRow[] {
  const { events, responses, estimates, limit = 30, now = new Date() } = input
  const hotCache = new Map<string, boolean>()
  const signals: Record<string, EngagementSignals> = signalsFromEvents(
    events.map((e) => ({ estimate_id: e.estimate_id, visitor_id: e.visitor_id ?? e.session_id, event_type: e.event_type, created_at: e.created_at })),
  )
  const isHot = (estimateId: string, e: ClientActivityEstimate): boolean => {
    const cached = hotCache.get(estimateId)
    if (cached !== undefined) return cached
    const hot =
      deriveInterest({
        opens: e.viewCount,
        lastViewedAt: e.lastViewedAt,
        clientResponse: e.clientResponse,
        now,
        ...signals[estimateId],
      }).level === 'hot'
    hotCache.set(estimateId, hot)
    return hot
  }

  const rows: ClientActivityRow[] = []

  // Earliest event per (estimate, session, type) wins.
  const seen = new Map<string, ClientActivityEventRow>()
  for (const ev of events) {
    if (!EVENT_KIND[ev.event_type]) continue
    const key = `${ev.estimate_id}|${ev.session_id}|${ev.event_type}`
    const prev = seen.get(key)
    if (!prev || new Date(ev.created_at).getTime() < new Date(prev.created_at).getTime()) seen.set(key, ev)
  }
  for (const ev of seen.values()) {
    const est = estimates[ev.estimate_id]
    const kind = EVENT_KIND[ev.event_type]
    if (!est || !kind) continue
    rows.push({
      id: `ev:${ev.id}`,
      kind,
      at: ev.created_at,
      estimateId: ev.estimate_id,
      projectId: est.projectId,
      projectName: est.projectName,
      clientName: est.clientName,
      device: ev.device,
      hot: isHot(ev.estimate_id, est),
      count: 1,
    })
  }

  for (const r of responses) {
    const kind = RESPONSE_KIND[r.event_type]
    if (!kind || !r.estimate_id) continue
    if (r.metadata?.source === 'manual') continue
    const est = estimates[r.estimate_id]
    if (!est) continue
    rows.push({
      id: `resp:${r.id}`,
      kind,
      at: r.created_at,
      estimateId: r.estimate_id,
      projectId: est.projectId,
      projectName: est.projectName,
      clientName: est.clientName,
      device: null,
      hot: false,
      count: 1,
    })
  }

  rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return foldRepeatedOpens(rows).slice(0, limit)
}

/**
 * Pure: back-to-back opens of the same estimate on the same (UTC) day become
 * one row ("opened 4 times"), so one busy client doesn't fill the whole card.
 * Rows must already be newest first; the newest open keeps its time and device.
 */
export function foldRepeatedOpens(rows: ClientActivityRow[]): ClientActivityRow[] {
  const out: ClientActivityRow[] = []
  for (const row of rows) {
    const prev = out[out.length - 1]
    if (
      prev &&
      prev.kind === 'opened' &&
      row.kind === 'opened' &&
      prev.estimateId === row.estimateId &&
      prev.at.slice(0, 10) === row.at.slice(0, 10)
    ) {
      out[out.length - 1] = { ...prev, count: prev.count + row.count }
      continue
    }
    out.push(row)
  }
  return out
}

const WINDOW_DAYS = 30

type EstimateJoinRow = {
  id: string
  view_count: number | null
  last_viewed_at: string | null
  client_response: string | null
  project:
    | { id: string; name: string; deleted_at: string | null; client: { name: string } | { name: string }[] | null }
    | { id: string; name: string; deleted_at: string | null; client: { name: string } | { name: string }[] | null }[]
    | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export async function getClientActivity(
  supabase: SupabaseClient,
  companyId: string,
  limit = 30,
): Promise<ClientActivityRow[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()

  const [eventsRes, responsesRes] = await Promise.all([
    supabase
      .from('estimate_engagement_events')
      .select('id, estimate_id, session_id, visitor_id, event_type, device, created_at')
      .eq('company_id', companyId)
      .in('event_type', ['view', 'pdf_download', 'sign_start', 'print'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(400),
    supabase
      .from('estimate_activity')
      .select('id, estimate_id, event_type, created_at, metadata')
      .eq('company_id', companyId)
      .in('event_type', ['estimate_accepted', 'estimate_declined'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit),
  ])
  if (eventsRes.error || responsesRes.error) {
    console.error('[getClientActivity] supabase error', {
      companyId,
      events: eventsRes.error?.message ?? null,
      responses: responsesRes.error?.message ?? null,
    })
    return []
  }

  const events = (eventsRes.data ?? []) as ClientActivityEventRow[]
  const responses = (responsesRes.data ?? []) as ClientActivityResponseRow[]
  const estimateIds = [
    ...new Set([
      ...events.map((e) => e.estimate_id),
      ...responses.map((r) => r.estimate_id).filter((id): id is string => Boolean(id)),
    ]),
  ]
  if (estimateIds.length === 0) return []

  const { data: estimateRows, error } = await supabase
    .from('estimates')
    .select(
      'id, view_count, last_viewed_at, client_response, project:projects!estimates_project_id_fkey(id, name, deleted_at, client:clients(name))',
    )
    .in('id', estimateIds)
  if (error) {
    console.error('[getClientActivity] estimates error', { companyId, message: error.message })
    return []
  }

  const estimates: Record<string, ClientActivityEstimate> = {}
  for (const row of (estimateRows ?? []) as unknown as EstimateJoinRow[]) {
    const project = one(row.project)
    if (!project || project.deleted_at) continue
    estimates[row.id] = {
      projectId: project.id,
      projectName: project.name,
      clientName: one(project.client)?.name ?? null,
      viewCount: Number(row.view_count) || 0,
      lastViewedAt: row.last_viewed_at,
      clientResponse: row.client_response,
    }
  }

  return buildClientActivity({ events, responses, estimates, limit })
}
