import type { SupabaseClient } from '@supabase/supabase-js'
import type { Photo } from './photo'
import { getEstimatePhotos } from './estimate-photo'

export interface Estimate {
  id: string
  project_id: string
  company_id: string
  currency_code?: string
  version: number
  /** Per-company sequential identifier, auto-assigned. Unique across the tenant. */
  estimate_seq: number
  /** Optional user-set override displayed instead of the auto sequence. */
  estimate_number: string | null
  /** Optional user-set override for the displayed estimate date. */
  estimate_date: string | null
  is_current: boolean
  share_token: string
  status: string
  /** Phase 52 (SEED-016): target language for this estimate. Defaults to 'en'. */
  language: 'en' | 'pt' | 'es'
  summary: string | null
  notes: string | null
  timeline: string | null
  payment_terms: string | null
  warranty_terms: string | null
  subtotal: number
  discount_type: string | null
  discount_value: number
  discount_amount: number
  tax_rate: number
  tax_amount: number
  total: number
  /** Phase 129 deposit columns (migration 20260627000001). Persisted by the server;
   *  renderers READ these via deriveDepositDisplay() — never recompute (GUARD-03). */
  deposit_type: 'none' | 'percent' | 'amount' // NOT NULL DEFAULT 'none'
  deposit_value: number | null // raw % or $ entered (nullable)
  balance_due: number | null // total − deposit; null on legacy rows
  sent_at: string | null
  viewed_at: string | null
  responded_at: string | null
  client_response: string | null
  created_at: string
  updated_at: string
  payment_status?: string | null
  paid_at?: string | null
  payment_amount_cents?: number | null
  /** User who created this estimate — drives "Prepared by" in PDFs. */
  created_by_user_id?: string | null
}

export interface EstimateSection {
  id: string
  estimate_id: string
  company_id: string
  title: string
  sort_order: number
  subtotal: number
}

export interface EstimateItem {
  id: string
  section_id: string
  company_id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
  sort_order: number
  price_source: 'price_book' | 'ai_estimate' | 'researched' | null
}

export interface EstimateWithSections extends Estimate {
  sections: (EstimateSection & { items: EstimateItem[] })[]
  attachedPhotos: Photo[]
}

export async function getProjectEstimates(
  supabase: SupabaseClient,
  projectId: string
): Promise<Estimate[]> {
  const { data } = await supabase
    .from('estimates')
    .select('*')
    .eq('project_id', projectId)
    .order('version', { ascending: false })

  return (data ?? []) as Estimate[]
}

export async function getCurrentEstimate(
  supabase: SupabaseClient,
  projectId: string
): Promise<EstimateWithSections | null> {
  const { data: estimate } = await supabase
    .from('estimates')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .single()

  if (!estimate) return null

  return fetchEstimateWithSections(supabase, estimate as Estimate)
}

export async function getEstimateById(
  supabase: SupabaseClient,
  estimateId: string
): Promise<EstimateWithSections | null> {
  const { data: estimate } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', estimateId)
    .single()

  if (!estimate) return null

  return fetchEstimateWithSections(supabase, estimate as Estimate)
}

export async function getEstimateWithContext(
  supabase: SupabaseClient,
  estimateId: string
) {
  const estimate = await getEstimateById(supabase, estimateId)
  if (!estimate) return null

  const { data: project } = await supabase
    .from('projects')
    .select(
      'name, project_type, client:clients(name, email, phone, address, city, state, zip)'
    )
    .eq('id', estimate.project_id)
    .single()

  const { data: company } = await supabase
    .from('companies')
    .select(
      'name, owner_name, phone, email, website, address, city, state, zip, logo_url, brand_primary_color, estimate_terms_enabled, estimate_terms_text'
    )
    .eq('id', estimate.company_id)
    .single()

  return { estimate, project, company }
}

async function fetchEstimateWithSections(
  supabase: SupabaseClient,
  estimate: Estimate
): Promise<EstimateWithSections> {
  // Single query: fetch every section with its items embedded via the
  // estimate_items.section_id FK, replacing the prior N+1 (one items query per
  // section). Both levels are ordered by sort_order.
  const [{ data: sectionsData }, attachedPhotos] = await Promise.all([
    supabase
      .from('estimate_sections')
      .select('*, items:estimate_items(*)')
      .eq('estimate_id', estimate.id)
      .order('sort_order', { ascending: true })
      .order('sort_order', { foreignTable: 'estimate_items', ascending: true }),
    getEstimatePhotos(supabase, estimate.id),
  ])

  const sections = (sectionsData ?? []) as unknown as (EstimateSection & {
    items: EstimateItem[] | null
  })[]

  return {
    ...estimate,
    sections: sections.map((section) => ({
      ...section,
      items: (section.items ?? []) as EstimateItem[],
    })),
    attachedPhotos,
  }
}
