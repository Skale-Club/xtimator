import type { Database } from '@/types/database.types'

// ── SAFE_EVENT_COLUMNS ────────────────────────────────────────────────────────
// ADMINLOG-05 contract: these are the ONLY columns rendered anywhere in the
// event log UI. The table has no sensitive-data column by Phase 92 design, but
// an explicit whitelist ensures future schema additions are never accidentally rendered.
export const SAFE_EVENT_COLUMNS = [
  'id',
  'attempt_id',
  'project_id',
  'estimate_id',
  'user_id',
  'company_id',
  'input_type',
  'step',
  'status',
  'error_message',
  'error_code',
  'provider',
  'duration_ms',
  'retry_count',
  'created_at',
] as const

export type SafeEvent = Pick<
  Database['public']['Tables']['pipeline_events']['Row'],
  (typeof SAFE_EVENT_COLUMNS)[number]
>

// ── buildSearchOr ─────────────────────────────────────────────────────────────
// Builds a PostgREST .or() filter string for multi-field search on pipeline_attempts.
// CRITICAL: UUID columns (attempt_id, project_id, estimate_id, user_id) must use
// .eq — ILIKE on uuid columns throws in Postgres ("operator does not exist: uuid ~~ unknown").
// ILIKE is valid ONLY on TEXT columns (error_message, error_code).
// Email resolution (term contains '@') is handled at the call site, not here.
function isUuid(term: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term)
}

export function buildSearchOr(term: string): string {
  // Strip PostgREST meta-chars to prevent injection / parse errors
  const esc = term.replace(/[%,()]/g, '')
  const clauses: string[] = [
    `error_message.ilike.%${esc}%`,
    `error_code.ilike.%${esc}%`,
  ]
  if (isUuid(esc)) {
    // Only exact-match uuid columns when the term is a valid UUID shape
    clauses.push(
      `attempt_id.eq.${esc}`,
      `project_id.eq.${esc}`,
      `estimate_id.eq.${esc}`,
      `user_id.eq.${esc}`,
    )
  }
  return clauses.join(',')
}

// ── terminalStatus ────────────────────────────────────────────────────────────
// D-01 precedence: failed > started > succeeded. Used in EventStepTimeline header.
export function terminalStatus(
  rows: { status: string }[],
): 'failed' | 'started' | 'succeeded' {
  if (rows.some((r) => r.status === 'failed')) return 'failed'
  if (rows.some((r) => r.status === 'started')) return 'started'
  return 'succeeded'
}

// ── formatDuration ────────────────────────────────────────────────────────────
// null → em-dash (precedent: billing-table.tsx:90); number → "{n} ms"
export function formatDuration(ms: number | null): string {
  if (ms == null) return '—' // em-dash U+2014
  return `${ms} ms`
}
