import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstimateDocumentData, DocumentCompany, DocumentClient } from '@/lib/estimate/document/model'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import {
  isEstimateTemplateId,
  DEFAULT_ESTIMATE_TEMPLATE_ID,
  type EstimateTemplateId,
} from '@/lib/estimate/templates/registry'

// ---------------------------------------------------------------------------
// Phase 193 Plan 03 — engagement query layer.
//
// Every function here takes the caller's own SupabaseClient (browser or
// server) and relies on the estimate_engagement_events_select RLS policy
// (migration 20260825000001) — company-member scoped. Never pass the
// service-role client into these; that policy is the ONLY authorization
// check standing between one company's dashboard and another's telemetry.
//
// estimate_engagement_events is written exclusively by 193-01's collector
// (service role), so these are read-only aggregation helpers. Row counts are
// expected to stay small at this stage (one company, one estimate, 90-day
// retention) — plain fetch + in-memory TS aggregation is preferred over a SQL
// view/RPC for now. If a company's event volume ever makes the unbounded
// LIMITs below a real cost, that aggregation should move into a SQL view —
// noted for future revisit, not built here.
// ---------------------------------------------------------------------------

/** Mirrors the estimate_engagement_events table shape (types/database.types.ts).
 *  Declared locally (not imported from the generated Database type) to match
 *  this codebase's lib/queries/*.ts convention of hand-maintained row shapes. */
export interface EngagementEventRow {
  id: string
  estimate_id: string
  company_id: string
  visitor_id: string
  session_id: string
  event_type:
    | 'view'
    | 'click'
    | 'scroll_depth'
    | 'section_view'
    | 'heartbeat'
    | 'unlock_ok'
    | 'unlock_fail'
  target: string | null
  x_pct: number | null
  y_px: number | null
  doc_h: number | null
  viewport_w: number | null
  device: 'mobile' | 'desktop' | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface EstimateEngagementSummary {
  opens: number
  uniqueVisitors: number
  lastViewedAt: string | null
  totalSeconds: number
  maxScrollPct: number
  sectionsViewed: number
  clicks: number
  deviceSplit: { mobile: number; desktop: number; unknown: number }
  unlockFails: number
}

export interface EngagementClickPoint {
  xPct: number
  yPx: number
  docH: number
  target: string | null
  device: 'mobile' | 'desktop' | null
}

export interface EngagementVisit {
  sessionId: string
  startedAt: string
  seconds: number
  device: 'mobile' | 'desktop' | null
  maxScrollPct: number
}

// A single event row's `metadata` JSONB is producer-defined (193-01 owns the
// collector). The contract assumed here — `{ seconds }` on 'heartbeat',
// `{ pct }` on 'scroll_depth' — matches the CONTEXT.md heatmap/heartbeat
// decisions; unrecognized/missing shapes are simply skipped (Number.isFinite
// guard), never thrown, so an ingestion-side contract drift degrades to "0"
// instead of crashing the panel.
function readNumericMetadata(metadata: Record<string, unknown> | null, key: string): number | null {
  const value = metadata?.[key]
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * Pure aggregation over already-fetched rows — kept separate from the fetch
 * so it's unit-testable against fixtures with zero Supabase dependency.
 */
export function aggregateEngagementSummary(rows: EngagementEventRow[]): EstimateEngagementSummary {
  const visitors = new Set<string>()
  const sections = new Set<string>()
  const deviceSplit = { mobile: 0, desktop: 0, unknown: 0 }
  let opens = 0
  let clicks = 0
  let unlockFails = 0
  let totalSeconds = 0
  let maxScrollPct = 0
  let lastViewedAt: string | null = null

  for (const row of rows) {
    visitors.add(row.visitor_id)

    switch (row.event_type) {
      case 'view': {
        opens += 1
        if (!lastViewedAt || row.created_at > lastViewedAt) lastViewedAt = row.created_at
        if (row.device === 'mobile') deviceSplit.mobile += 1
        else if (row.device === 'desktop') deviceSplit.desktop += 1
        else deviceSplit.unknown += 1
        break
      }
      case 'click':
        clicks += 1
        break
      case 'heartbeat': {
        const seconds = readNumericMetadata(row.metadata, 'seconds')
        if (seconds != null) totalSeconds += seconds
        break
      }
      case 'scroll_depth': {
        const pct = readNumericMetadata(row.metadata, 'pct')
        if (pct != null) maxScrollPct = Math.max(maxScrollPct, pct)
        break
      }
      case 'section_view':
        if (row.target) sections.add(row.target)
        break
      case 'unlock_fail':
        unlockFails += 1
        break
      default:
        break
    }
  }

  return {
    opens,
    uniqueVisitors: visitors.size,
    lastViewedAt,
    totalSeconds,
    maxScrollPct,
    sectionsViewed: sections.size,
    clicks,
    deviceSplit,
    unlockFails,
  }
}

/**
 * Pure per-session rollup over already-fetched rows — same testability
 * reasoning as aggregateEngagementSummary above.
 */
export function aggregateViewTimeline(rows: EngagementEventRow[]): EngagementVisit[] {
  const bySession = new Map<
    string,
    { startedAt: string; seconds: number; device: 'mobile' | 'desktop' | null; maxScrollPct: number }
  >()

  for (const row of rows) {
    let entry = bySession.get(row.session_id)
    if (!entry) {
      entry = { startedAt: row.created_at, seconds: 0, device: row.device, maxScrollPct: 0 }
      bySession.set(row.session_id, entry)
    }
    if (row.created_at < entry.startedAt) entry.startedAt = row.created_at
    if (!entry.device && row.device) entry.device = row.device

    if (row.event_type === 'heartbeat') {
      const seconds = readNumericMetadata(row.metadata, 'seconds')
      if (seconds != null) entry.seconds += seconds
    } else if (row.event_type === 'scroll_depth') {
      const pct = readNumericMetadata(row.metadata, 'pct')
      if (pct != null) entry.maxScrollPct = Math.max(entry.maxScrollPct, pct)
    }
  }

  return Array.from(bySession.entries())
    .map(([sessionId, v]) => ({ sessionId, ...v }))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)) // newest visit first
}

// Bounds match the plan's "capped at 2000 rows" for click points; the
// summary/timeline fetches use a wider cap since they must see EVERY event
// type, not just clicks, to aggregate correctly.
const SUMMARY_ROW_LIMIT = 10000
const CLICK_POINT_LIMIT = 2000

export async function getEstimateEngagementSummary(
  supabase: SupabaseClient,
  estimateId: string
): Promise<EstimateEngagementSummary> {
  const { data } = await supabase
    .from('estimate_engagement_events')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('created_at', { ascending: false })
    .limit(SUMMARY_ROW_LIMIT)

  return aggregateEngagementSummary((data ?? []) as EngagementEventRow[])
}

export async function getEstimateViewTimeline(
  supabase: SupabaseClient,
  estimateId: string
): Promise<EngagementVisit[]> {
  const { data } = await supabase
    .from('estimate_engagement_events')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('created_at', { ascending: false })
    .limit(SUMMARY_ROW_LIMIT)

  return aggregateViewTimeline((data ?? []) as EngagementEventRow[])
}

/**
 * Summary + timeline from a SINGLE fetch. The panel renders both at once, and
 * both derive from the same unfiltered event set — calling the two functions
 * above side by side pulls the same rows over the wire twice.
 */
export async function getEstimateEngagementOverview(
  supabase: SupabaseClient,
  estimateId: string
): Promise<{ summary: EstimateEngagementSummary; visits: EngagementVisit[] }> {
  const { data } = await supabase
    .from('estimate_engagement_events')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('created_at', { ascending: false })
    .limit(SUMMARY_ROW_LIMIT)

  const rows = (data ?? []) as EngagementEventRow[]
  return { summary: aggregateEngagementSummary(rows), visits: aggregateViewTimeline(rows) }
}

export async function getEstimateClickPoints(
  supabase: SupabaseClient,
  estimateId: string
): Promise<EngagementClickPoint[]> {
  const { data } = await supabase
    .from('estimate_engagement_events')
    .select('x_pct, y_px, doc_h, target, device')
    .eq('estimate_id', estimateId)
    .eq('event_type', 'click')
    .order('created_at', { ascending: false })
    .limit(CLICK_POINT_LIMIT)

  return ((data ?? []) as Array<Pick<EngagementEventRow, 'x_pct' | 'y_px' | 'doc_h' | 'target' | 'device'>>)
    .filter((row) => row.x_pct != null && row.y_px != null && row.doc_h != null)
    .map((row) => ({
      xPct: Number(row.x_pct),
      yPx: Number(row.y_px),
      docH: Number(row.doc_h),
      target: row.target,
      device: row.device,
    }))
}

// ---------------------------------------------------------------------------
// Heatmap document fetch — Task 3 needs the same read-only document renderer
// the share page uses (components/workspace/estimate/estimate-document.tsx
// mode="view", or components/share/estimate-document-modern.tsx), but the
// heatmap Dialog is opened from a client-triggered Sheet with only an
// estimateId in hand. lib/queries/estimate.ts's getEstimateWithContext can't
// be reused here: fetchEstimateWithSections calls requireServiceClient() for
// the signature-snapshot lookup, which throws when bundled/run client-side.
// This fetches the narrower set of fields the read-only renderers actually
// need, entirely through the authenticated client (same RLS posture as the
// rest of this file).
// ---------------------------------------------------------------------------

export interface EngagementHeatmapDocument {
  templateId: EstimateTemplateId
  data: EstimateDocumentData
  company: DocumentCompany
  client: DocumentClient | null
  projectName: string
  projectType: string | null
  language: EstimateLanguage
  estimateVersion: number
  estimateSeq: number
  estimateCreatedAt: string
}

export async function getEstimateDocumentForHeatmap(
  supabase: SupabaseClient,
  estimateId: string
): Promise<EngagementHeatmapDocument | null> {
  const { data: estimate } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', estimateId)
    .maybeSingle()
  if (!estimate) return null

  const [{ data: sectionsData }, { data: project }, { data: company }] = await Promise.all([
    supabase
      .from('estimate_sections')
      .select('*, items:estimate_items(*)')
      .eq('estimate_id', estimateId)
      .order('sort_order', { ascending: true })
      .order('sort_order', { foreignTable: 'estimate_items', ascending: true }),
    supabase
      .from('projects')
      .select('name, project_type, client:clients(id, name, email, phone, address, city, state, zip)')
      .eq('id', estimate.project_id)
      .single(),
    supabase
      .from('companies')
      .select(
        'name, owner_name, phone, email, website, address, city, state, zip, logo_url, brand_primary_color, estimate_terms_enabled, estimate_terms_text, estimate_template_style'
      )
      .eq('id', estimate.company_id)
      .single(),
  ])

  type SectionRow = {
    id: string
    title: string
    subtotal: number
    sort_order: number
    items: Array<{
      id: string
      description: string
      quantity: number
      unit: string | null
      unit_price: number
      total: number
      sort_order: number
      price_source: 'price_book' | 'ai_estimate' | 'researched' | null
      taxable: boolean | null
      tax_category: 'labor' | 'materials' | 'other' | null
      discount: number | null
      cost: number | null
      markup_pct: number | null
    }> | null
  }
  const sections = ((sectionsData ?? []) as SectionRow[])

  const documentData: EstimateDocumentData = {
    summary: estimate.summary,
    notes: estimate.notes,
    timeline: estimate.timeline,
    payment_terms: estimate.payment_terms,
    warranty_terms: estimate.warranty_terms,
    discount_type: estimate.discount_type,
    discount_value: estimate.discount_value,
    discount_amount: estimate.discount_amount,
    tax_rate: estimate.tax_rate,
    tax_amount: estimate.tax_amount,
    subtotal: estimate.subtotal,
    total: estimate.total,
    // Unused by the view-mode totals block (deriveDepositDisplay recomputes
    // depositAmount from total/balance_due — lib/estimate/deposit-display.ts)
    // — same 0 placeholder use-estimate-reducer.ts's INIT case uses.
    deposit_type: estimate.deposit_type ?? 'none',
    deposit_value: estimate.deposit_value ?? null,
    deposit: 0,
    balance_due: estimate.balance_due ?? estimate.total,
    currency_code: estimate.currency_code ?? 'USD',
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      subtotal: s.subtotal,
      items: (s.items ?? []).map((i) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        total: i.total,
        sort_order: i.sort_order,
        price_source: i.price_source,
        taxable: i.taxable ?? true,
        tax_category: i.tax_category,
        discount: i.discount ?? 0,
        cost: i.cost,
        markup_pct: i.markup_pct,
      })),
    })),
    estimate_date: estimate.estimate_date,
    estimate_number: estimate.estimate_number,
    presentation_settings: estimate.presentation_settings,
  }

  const documentCompany: DocumentCompany = company
    ? {
        name: company.name,
        owner_name: company.owner_name,
        phone: company.phone,
        email: company.email,
        website: company.website,
        address: company.address,
        city: company.city,
        state: company.state,
        zip: company.zip,
        logo_url: company.logo_url,
        brand_primary_color: company.brand_primary_color,
        estimate_terms_enabled: company.estimate_terms_enabled ?? false,
        estimate_terms_text: company.estimate_terms_text ?? null,
      }
    : {
        name: '',
        owner_name: null,
        phone: null,
        email: null,
        website: null,
        address: null,
        city: null,
        state: null,
        zip: null,
        logo_url: null,
        brand_primary_color: null,
      }

  type ProjectClientRow = { id: string; name: string; email: string | null; phone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null }
  const rawClient = (project as unknown as { client?: ProjectClientRow | ProjectClientRow[] | null } | null)?.client
  const clientRow = Array.isArray(rawClient) ? (rawClient[0] ?? null) : (rawClient ?? null)
  const documentClient: DocumentClient | null = clientRow
    ? {
        id: clientRow.id,
        name: clientRow.name,
        email: clientRow.email,
        phone: clientRow.phone,
        address: clientRow.address,
        city: clientRow.city,
        state: clientRow.state,
        zip: clientRow.zip,
      }
    : null

  const templateId = isEstimateTemplateId(company?.estimate_template_style)
    ? (company!.estimate_template_style as EstimateTemplateId)
    : DEFAULT_ESTIMATE_TEMPLATE_ID

  return {
    templateId,
    data: documentData,
    company: documentCompany,
    client: documentClient,
    projectName: project?.name ?? '',
    projectType: project?.project_type ?? null,
    language: (estimate.language ?? 'en') as EstimateLanguage,
    estimateVersion: estimate.version,
    estimateSeq: estimate.estimate_seq,
    estimateCreatedAt: estimate.created_at,
  }
}
