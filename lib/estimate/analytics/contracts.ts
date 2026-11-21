// ---------------------------------------------------------------------------
// Estimate analytics — shared contracts.
//
// One place that defines what the per-estimate analytics speaks: the
// engagement event types the public share page may emit, the interest
// classifier (with human reasons, so the UI can say WHY an estimate is hot),
// and the shape of the unified timeline that merges the owner-side activity
// log (estimate_activity) with the client-side visits
// (estimate_engagement_events).
//
// Pure module: no React, no Supabase. Safe to import from server components,
// client components, Inngest functions and tests.
// ---------------------------------------------------------------------------

/**
 * Every event_type the share-page collector accepts. Must match the CHECK
 * constraint on estimate_engagement_events (latest migration that touches it).
 */
export const ENGAGEMENT_EVENT_TYPES = [
  'view',
  'click',
  'scroll_depth',
  'section_view',
  'heartbeat',
  'unlock_ok',
  'unlock_fail',
  // Added with the analytics overhaul (2026-11-20):
  'pdf_download', // client downloaded the PDF from the share page
  'print', // client printed the page (beforeprint)
  'sign_start', // client opened the signature / accept flow
  'contact_click', // client tapped the company phone, email or website (target = 'phone' | 'email' | 'website')
] as const

export type EngagementEventType = (typeof ENGAGEMENT_EVENT_TYPES)[number]

/** Client actions that are worth a line of their own in the timeline. */
export const ACTION_EVENT_TYPES = ['pdf_download', 'print', 'sign_start', 'contact_click'] as const
export type ActionEventType = (typeof ACTION_EVENT_TYPES)[number]

/** A visit shorter than this is a "quick open" and is grouped in the timeline. */
export const QUICK_OPEN_MAX_SECONDS = 10

/** A visit that reached at least this scroll depth counts as "read to the end". */
export const READ_TO_END_PCT = 90

// ---------------------------------------------------------------------------
// Interest
// ---------------------------------------------------------------------------

export type InterestLevel = 'hot' | 'warm' | 'cold' | 'none'

/**
 * Reason keys. The UI turns each into an English source string that goes
 * through t() (see INTEREST_REASON_LABELS) — counts are interpolated by the
 * caller, never baked into the translated string.
 */
export type InterestReason =
  | 'many_opens' // opened 3+ times
  | 'several_people' // 2+ distinct visitors (probably forwarded to a partner)
  | 'read_to_end' // at least one visit reached the end
  | 'time_on_totals' // 30s+ on the totals section
  | 'came_back' // a visit on a different day than the first one
  | 'started_signing' // opened the signature flow
  | 'downloaded_pdf' // downloaded or printed it
  | 'recent' // last opened in the past 48h
  | 'gone_quiet' // opened before, nothing in the last 7 days

export const INTEREST_REASON_LABELS: Record<InterestReason, string> = {
  many_opens: 'Opened many times',
  several_people: 'More than one person opened it',
  read_to_end: 'Read it to the end',
  time_on_totals: 'Spent time on the totals',
  came_back: 'Came back on another day',
  started_signing: 'Started signing',
  downloaded_pdf: 'Downloaded or printed it',
  recent: 'Opened in the last 2 days',
  gone_quiet: 'No visits in the last 7 days',
}

/**
 * Everything the classifier can use. All fields are optional so the project
 * list (which only has the cheap counters on `estimates`) and the full
 * analytics drawer (which has every event) share one rule.
 */
export interface InterestInput {
  opens: number
  lastViewedAt: string | null
  uniqueVisitors?: number
  readToEndVisits?: number
  totalsDwellSeconds?: number
  distinctVisitDays?: number
  signStarts?: number
  pdfDownloads?: number
  prints?: number
  /** Accepted / declined estimates are past the interest question. */
  clientResponse?: string | null
  /** Injected for tests. */
  now?: Date
}

export interface InterestResult {
  level: InterestLevel
  /** Ordered strongest first; the UI shows the first 3. */
  reasons: InterestReason[]
}

const HOUR = 3_600_000

export function deriveInterest(input: InterestInput): InterestResult {
  if (!input.opens || input.opens <= 0) return { level: 'none', reasons: [] }

  const now = (input.now ?? new Date()).getTime()
  const last = input.lastViewedAt ? new Date(input.lastViewedAt).getTime() : NaN
  const hoursSinceLast = Number.isFinite(last) ? (now - last) / HOUR : Infinity

  const strong: InterestReason[] = []
  if ((input.signStarts ?? 0) > 0) strong.push('started_signing')
  if ((input.pdfDownloads ?? 0) + (input.prints ?? 0) > 0) strong.push('downloaded_pdf')
  if ((input.uniqueVisitors ?? 0) >= 2) strong.push('several_people')
  if (input.opens >= 3) strong.push('many_opens')
  if ((input.distinctVisitDays ?? 0) >= 2) strong.push('came_back')
  if ((input.totalsDwellSeconds ?? 0) >= 30) strong.push('time_on_totals')
  if ((input.readToEndVisits ?? 0) > 0) strong.push('read_to_end')

  const recent = hoursSinceLast <= 48
  const quiet = hoursSinceLast >= 24 * 7

  if (input.clientResponse === 'accepted' || input.clientResponse === 'declined') {
    return { level: 'none', reasons: strong }
  }

  if (quiet) {
    return { level: 'cold', reasons: ['gone_quiet', ...strong] }
  }

  const reasons = recent ? [...strong, 'recent' as const] : strong
  // Hot = two strong signals, or one decisive one (signing / PDF) — and not gone quiet.
  const decisive = strong.includes('started_signing') || strong.includes('downloaded_pdf')
  if (decisive || strong.length >= 2) return { level: 'hot', reasons }
  return { level: 'warm', reasons }
}

// ---------------------------------------------------------------------------
// Unified timeline
// ---------------------------------------------------------------------------

export type TimelineChannel = 'email' | 'sms' | 'whatsapp' | 'link' | 'other'

export type AnalyticsTimelineEntry =
  | { kind: 'created'; at: string }
  | { kind: 'generated'; at: string }
  | { kind: 'updated'; at: string; totalDelta?: number | null }
  | { kind: 'sent'; at: string; channel: TimelineChannel; to?: string | null }
  | {
      kind: 'visit'
      at: string
      sessionId: string
      visitorId: string
      /** 1-based index of the visitor in order of first appearance ("Person 2"). */
      visitorIndex: number
      device: 'mobile' | 'desktop' | null
      seconds: number
      maxScrollPct: number
      topSection: string | null
      /** True for the first visit ever. */
      first: boolean
    }
  // `at` is the LAST open of the run (so it sorts and groups by when the client
  // last came by); `since` is the first.
  | { kind: 'quick_opens'; at: string; since: string; count: number }
  | { kind: 'action'; at: string; action: ActionEventType; target?: string | null }
  | { kind: 'accepted'; at: string; signedOnline: boolean }
  | { kind: 'declined'; at: string }
  | { kind: 'response_cleared'; at: string }

export interface EstimateAnalyticsSummary {
  opens: number
  uniqueVisitors: number
  firstViewedAt: string | null
  lastViewedAt: string | null
  totalSeconds: number
  avgSecondsPerVisit: number
  /** Visits that reached READ_TO_END_PCT. */
  readToEndVisits: number
  /** Visits that are not quick opens. */
  realVisits: number
  distinctVisitDays: number
  sectionDwell: Record<string, number>
  itemDwell: Record<string, number>
  clicks: number
  deviceSplit: { mobile: number; desktop: number; unknown: number }
  pdfDownloads: number
  prints: number
  signStarts: number
  contactClicks: number
  unlockFails: number
}

/** One open of the share page, quick ones included. Oldest first in `visits`. */
export interface AnalyticsVisit {
  at: string
  sessionId: string
  visitorId: string
  /** 1-based index of the visitor in order of first appearance. */
  visitorIndex: number
  device: 'mobile' | 'desktop' | null
  seconds: number
  maxScrollPct: number
  /** Shorter than QUICK_OPEN_MAX_SECONDS and barely scrolled. */
  quick: boolean
}

export interface EstimateAnalytics {
  summary: EstimateAnalyticsSummary
  interest: InterestResult
  /** Newest first. */
  timeline: AnalyticsTimelineEntry[]
  /** Every visit including quick ones, oldest first. */
  visits: AnalyticsVisit[]
}
