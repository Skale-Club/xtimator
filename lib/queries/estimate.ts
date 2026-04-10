import type { SupabaseClient } from '@supabase/supabase-js'

export interface Estimate {
  id: string
  project_id: string
  company_id: string
  version: number
  is_current: boolean
  share_token: string
  status: string
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
  sent_at: string | null
  viewed_at: string | null
  responded_at: string | null
  client_response: string | null
  created_at: string
  updated_at: string
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
}

export interface EstimateWithSections extends Estimate {
  sections: (EstimateSection & { items: EstimateItem[] })[]
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

async function fetchEstimateWithSections(
  supabase: SupabaseClient,
  estimate: Estimate
): Promise<EstimateWithSections> {
  const { data: sectionsData } = await supabase
    .from('estimate_sections')
    .select('*')
    .eq('estimate_id', estimate.id)
    .order('sort_order', { ascending: true })

  const sections = (sectionsData ?? []) as EstimateSection[]

  const sectionsWithItems = await Promise.all(
    sections.map(async (section) => {
      const { data: itemsData } = await supabase
        .from('estimate_items')
        .select('*')
        .eq('section_id', section.id)
        .order('sort_order', { ascending: true })

      return {
        ...section,
        items: (itemsData ?? []) as EstimateItem[],
      }
    })
  )

  return {
    ...estimate,
    sections: sectionsWithItems,
  }
}
