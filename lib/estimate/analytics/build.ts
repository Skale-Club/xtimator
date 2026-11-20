// ---------------------------------------------------------------------------
// buildEstimateAnalytics — pure aggregation behind the analytics drawer.
//
// Inputs are already-fetched rows (estimate_engagement_events, estimate_activity
// and the estimate row itself), so this module has no Supabase or React
// dependency and is tested against fixtures.
//
// Choices worth knowing:
//  - A "visit" is a session_id that has a 'view' event, or any reading signal
//    (heartbeat, scroll_depth, section_view, click). A session made only of
//    unlock_fail / action events is not an open.
//  - "Consecutive quick visits" means a run of quick visits with no other
//    timeline entry (sent, accepted, an action, a real visit...) between them
//    in chronological order. A quick visit is shorter than QUICK_OPEN_MAX_SECONDS
//    and never scrolled past QUICK_OPEN_MAX_SCROLL_PCT.
//  - distinctVisitDays is computed on UTC calendar days of each visit start.
//    The viewer's local day would need a timezone; a 1-day wobble around
//    midnight does not change the "came back on another day" signal.
//  - Heartbeat seconds are summed as reported; older data may under-report.
// ---------------------------------------------------------------------------

import {
  ACTION_EVENT_TYPES,
  QUICK_OPEN_MAX_SECONDS,
  READ_TO_END_PCT,
  deriveInterest,
  type ActionEventType,
  type AnalyticsTimelineEntry,
  type EngagementEventType,
  type EstimateAnalytics,
  type EstimateAnalyticsSummary,
  type TimelineChannel,
} from './contracts'

/** A visit that never scrolled past this is still "quick" when it is also short. */
export const QUICK_OPEN_MAX_SCROLL_PCT = 25

const ITEM_TARGET_PREFIX = 'item:'

/** Row of estimate_engagement_events, with the new event types. */
export interface AnalyticsEventRow {
  visitor_id: string
  session_id: string
  event_type: EngagementEventType
  target: string | null
  device: 'mobile' | 'desktop' | null
  metadata: Record<string, unknown> | null
  created_at: string
}

/** Row of estimate_activity. */
export interface AnalyticsActivityRow {
  event_type: string
  metadata: Record<string, unknown> | null
  created_at: string
}

/** The estimate fields the builder falls back on. */
export interface AnalyticsEstimateInfo {
  created_at: string
  sent_at: string | null
  /** estimates.last_viewed_at (alias: viewed_at). Only used when no visit rows survive. */
  last_viewed_at?: string | null
  viewed_at?: string | null
  client_response: string | null
  responded_at: string | null
  signed_online?: boolean
}

export interface BuildEstimateAnalyticsInput {
  events: AnalyticsEventRow[]
  activity: AnalyticsActivityRow[]
  estimate: AnalyticsEstimateInfo
  now?: Date
}

function num(metadata: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = metadata?.[key]
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function str(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function time(iso: string): number {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}

interface Session {
  sessionId: string
  visitorId: string
  start: string
  device: 'mobile' | 'desktop' | null
  viewDevice: 'mobile' | 'desktop' | null
  seconds: number
  maxScrollPct: number
  dwell: Record<string, number>
  isVisit: boolean
}

const ACTION_SET = new Set<string>(ACTION_EVENT_TYPES)

function channelOf(raw: string | null): TimelineChannel {
  if (raw === 'email' || raw === 'sms' || raw === 'whatsapp') return raw
  return 'other'
}

export function buildEstimateAnalytics(input: BuildEstimateAnalyticsInput): EstimateAnalytics {
  const { events, activity, estimate } = input
  const now = input.now ?? new Date()

  // --- Sessions ------------------------------------------------------------
  const sorted = [...events].sort((a, b) => time(a.created_at) - time(b.created_at))
  const sessions = new Map<string, Session>()
  const sectionDwell: Record<string, number> = {}
  const itemDwell: Record<string, number> = {}
  let clicks = 0
  let unlockFails = 0
  const actionEntries: AnalyticsTimelineEntry[] = []
  const counts = { pdfDownloads: 0, prints: 0, signStarts: 0, contactClicks: 0 }

  for (const row of sorted) {
    let s = sessions.get(row.session_id)
    if (!s) {
      s = {
        sessionId: row.session_id,
        visitorId: row.visitor_id,
        start: row.created_at,
        device: null,
        viewDevice: null,
        seconds: 0,
        maxScrollPct: 0,
        dwell: {},
        isVisit: false,
      }
      sessions.set(row.session_id, s)
    }
    if (row.device && !s.device) s.device = row.device

    switch (row.event_type) {
      case 'view':
        s.isVisit = true
        if (row.device) s.viewDevice = row.device
        break
      case 'heartbeat': {
        s.isVisit = true
        const seconds = num(row.metadata, 'seconds')
        if (seconds != null && seconds > 0) s.seconds += seconds
        break
      }
      case 'scroll_depth': {
        s.isVisit = true
        const pct = num(row.metadata, 'pct')
        if (pct != null) s.maxScrollPct = Math.max(s.maxScrollPct, pct)
        break
      }
      case 'section_view': {
        s.isVisit = true
        if (!row.target) break
        const dwell = num(row.metadata, 'dwell_seconds')
        if (dwell == null || dwell <= 0) break
        if (row.target.startsWith(ITEM_TARGET_PREFIX)) {
          const id = row.target.slice(ITEM_TARGET_PREFIX.length)
          itemDwell[id] = (itemDwell[id] ?? 0) + dwell
        } else {
          sectionDwell[row.target] = (sectionDwell[row.target] ?? 0) + dwell
          s.dwell[row.target] = (s.dwell[row.target] ?? 0) + dwell
        }
        break
      }
      case 'click':
        s.isVisit = true
        clicks += 1
        break
      case 'unlock_fail':
        unlockFails += 1
        break
      case 'pdf_download':
      case 'print':
      case 'sign_start':
      case 'contact_click': {
        if (!ACTION_SET.has(row.event_type)) break
        if (row.event_type === 'pdf_download') counts.pdfDownloads += 1
        else if (row.event_type === 'print') counts.prints += 1
        else if (row.event_type === 'sign_start') counts.signStarts += 1
        else counts.contactClicks += 1
        actionEntries.push({
          kind: 'action',
          at: row.created_at,
          action: row.event_type as ActionEventType,
          target: row.target,
        })
        break
      }
      default:
        break
    }
  }

  const visitSessions = Array.from(sessions.values())
    .filter((s) => s.isVisit)
    .sort((a, b) => time(a.start) - time(b.start))

  // Visitor numbering: order of first appearance among visits.
  const visitorIndex = new Map<string, number>()
  for (const s of visitSessions) {
    if (!visitorIndex.has(s.visitorId)) visitorIndex.set(s.visitorId, visitorIndex.size + 1)
  }

  interface VisitInfo {
    session: Session
    device: 'mobile' | 'desktop' | null
    topSection: string | null
    quick: boolean
  }
  const visits: VisitInfo[] = visitSessions.map((session) => {
    let topSection: string | null = null
    let best = 0
    for (const [target, seconds] of Object.entries(session.dwell)) {
      if (seconds > best) {
        best = seconds
        topSection = target
      }
    }
    return {
      session,
      device: session.viewDevice ?? session.device,
      topSection,
      quick: session.seconds < QUICK_OPEN_MAX_SECONDS && session.maxScrollPct <= QUICK_OPEN_MAX_SCROLL_PCT,
    }
  })

  // --- Owner-side activity -------------------------------------------------
  const ownerEntries: AnalyticsTimelineEntry[] = []
  const activitySorted = [...activity].sort((a, b) => time(a.created_at) - time(b.created_at))
  let createdAt: string | null = null
  let sawSent = false
  let sawAccepted = false
  let sawDeclined = false

  for (const row of activitySorted) {
    switch (row.event_type) {
      case 'project_created':
      case 'estimate_created_blank':
        if (!createdAt) createdAt = row.created_at // earliest wins; one "created" entry only
        break
      case 'estimate_generated':
        ownerEntries.push({ kind: 'generated', at: row.created_at })
        break
      case 'estimate_updated':
        ownerEntries.push({ kind: 'updated', at: row.created_at, totalDelta: num(row.metadata, 'total_delta') })
        break
      case 'estimate_sent':
        sawSent = true
        ownerEntries.push({
          kind: 'sent',
          at: row.created_at,
          channel: channelOf(str(row.metadata, 'channel')),
          to: str(row.metadata, 'to'),
        })
        break
      case 'estimate_marked_sent':
        sawSent = true
        ownerEntries.push({ kind: 'sent', at: row.created_at, channel: 'link', to: null })
        break
      case 'estimate_accepted':
        sawAccepted = true
        ownerEntries.push({
          kind: 'accepted',
          at: row.created_at,
          signedOnline: str(row.metadata, 'source') !== 'manual' && Boolean(estimate.signed_online),
        })
        break
      case 'estimate_declined':
        sawDeclined = true
        ownerEntries.push({ kind: 'declined', at: row.created_at })
        break
      case 'estimate_response_cleared':
        ownerEntries.push({ kind: 'response_cleared', at: row.created_at })
        break
      default:
        break // unknown types are ignored
    }
  }

  // Fallbacks from the estimate row when the log lacks the matching row.
  ownerEntries.push({ kind: 'created', at: createdAt ?? estimate.created_at })
  if (!sawSent && estimate.sent_at) {
    ownerEntries.push({ kind: 'sent', at: estimate.sent_at, channel: 'other', to: null })
  }
  if (estimate.responded_at) {
    if (estimate.client_response === 'accepted' && !sawAccepted) {
      ownerEntries.push({ kind: 'accepted', at: estimate.responded_at, signedOnline: Boolean(estimate.signed_online) })
    } else if (estimate.client_response === 'declined' && !sawDeclined) {
      ownerEntries.push({ kind: 'declined', at: estimate.responded_at })
    }
  }

  // --- Visit entries, with quick opens collapsed ---------------------------
  type Chronological =
    | { type: 'entry'; at: string; entry: AnalyticsTimelineEntry }
    | { type: 'quick'; at: string }
  const chronological: Chronological[] = []
  visits.forEach((v, i) => {
    if (v.quick) {
      chronological.push({ type: 'quick', at: v.session.start })
      return
    }
    chronological.push({
      type: 'entry',
      at: v.session.start,
      entry: {
        kind: 'visit',
        at: v.session.start,
        sessionId: v.session.sessionId,
        visitorId: v.session.visitorId,
        visitorIndex: visitorIndex.get(v.session.visitorId) ?? 1,
        device: v.device,
        seconds: v.session.seconds,
        maxScrollPct: v.session.maxScrollPct,
        topSection: v.topSection,
        first: i === 0,
      },
    })
  })
  for (const entry of [...ownerEntries, ...actionEntries]) {
    chronological.push({ type: 'entry', at: entry.at, entry })
  }
  // Stable sort: on equal timestamps, creation/owner entries stay before visits.
  chronological.sort((a, b) => time(a.at) - time(b.at))

  const timelineAsc: AnalyticsTimelineEntry[] = []
  let run: string[] = []
  const flush = () => {
    if (run.length === 0) return
    timelineAsc.push({ kind: 'quick_opens', at: run[0], count: run.length, until: run[run.length - 1] })
    run = []
  }
  for (const item of chronological) {
    if (item.type === 'quick') {
      run.push(item.at)
    } else {
      flush()
      timelineAsc.push(item.entry)
    }
  }
  flush()
  const timeline = timelineAsc.reverse() // newest first

  // --- Summary -------------------------------------------------------------
  const realVisits = visits.filter((v) => !v.quick)
  const totalSeconds = visits.reduce((sum, v) => sum + v.session.seconds, 0)
  const realSeconds = realVisits.reduce((sum, v) => sum + v.session.seconds, 0)
  const visitDays = new Set(visits.map((v) => v.session.start.slice(0, 10)))
  const deviceSplit = { mobile: 0, desktop: 0, unknown: 0 }
  for (const v of visits) {
    if (v.device === 'mobile') deviceSplit.mobile += 1
    else if (v.device === 'desktop') deviceSplit.desktop += 1
    else deviceSplit.unknown += 1
  }
  const lastVisit = visits.length ? visits[visits.length - 1].session.start : null
  const fallbackLast = estimate.last_viewed_at ?? estimate.viewed_at ?? null

  const summary: EstimateAnalyticsSummary = {
    opens: visits.length,
    uniqueVisitors: visitorIndex.size,
    firstViewedAt: visits.length ? visits[0].session.start : null,
    lastViewedAt: lastVisit ?? fallbackLast,
    totalSeconds,
    avgSecondsPerVisit: realVisits.length ? realSeconds / realVisits.length : 0,
    readToEndVisits: visits.filter((v) => v.session.maxScrollPct >= READ_TO_END_PCT).length,
    realVisits: realVisits.length,
    distinctVisitDays: visitDays.size,
    sectionDwell,
    itemDwell,
    clicks,
    deviceSplit,
    pdfDownloads: counts.pdfDownloads,
    prints: counts.prints,
    signStarts: counts.signStarts,
    contactClicks: counts.contactClicks,
    unlockFails,
  }

  const interest = deriveInterest({
    opens: summary.opens,
    lastViewedAt: summary.lastViewedAt,
    uniqueVisitors: summary.uniqueVisitors,
    readToEndVisits: summary.readToEndVisits,
    totalsDwellSeconds: sectionDwell.totals ?? 0,
    distinctVisitDays: summary.distinctVisitDays,
    signStarts: summary.signStarts,
    pdfDownloads: summary.pdfDownloads,
    prints: summary.prints,
    clientResponse: estimate.client_response,
    now,
  })

  return { summary, interest, timeline }
}
