import { requireServiceClient } from '@/lib/supabase/service'
import type {
  Estimate,
  EstimateSection,
  EstimateItem,
  EstimateWithSections,
} from '@/lib/queries/estimate'

export interface ShareEstimateData {
  estimate: EstimateWithSections & {
    project: { name: string; project_type: string | null }
    company: {
      id: string
      name: string
      owner_name: string | null
      phone: string | null
      email: string | null
      website: string | null
      address: string | null
      city: string | null
      state: string | null
      zip: string | null
      logo_url: string | null
      brand_primary_color: string | null
      notify_on_view: boolean
      notify_on_accept: boolean
      notify_on_decline: boolean
      stripe_account_id: string | null
      stripe_connect_status: string | null
    }
    /** Phase 70 — Stripe Connect payment state. */
    payment_status: string
    /** Derived from `estimate.total` (dollars) — Math.round(total * 100). */
    total_amount_cents: number
    stripe_checkout_session_id: string | null
    paid_at: string | null
    payment_amount_cents: number | null
  }
  client: {
    name: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    state: string | null
    zip: string | null
  } | null
}

export async function getEstimateByShareToken(
  token: string
): Promise<ShareEstimateData | null> {
  const supabase = requireServiceClient()

  // Look up estimate by share_token
  const { data: estimateData } = await supabase
    .from('estimates')
    .select('*')
    .eq('share_token', token)
    .single()

  if (!estimateData) return null

  const estimate = estimateData as Estimate

  // Fetch sections with items (same pattern as fetchEstimateWithSections)
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

  const estimateWithSections: EstimateWithSections = {
    ...estimate,
    sections: sectionsWithItems,
  }

  // Fetch project + client
  const { data: projectData } = await supabase
    .from('projects')
    .select(
      'name, project_type, client_id, client:clients(name, email, phone, address, city, state, zip)'
    )
    .eq('id', estimate.project_id)
    .single()

  if (!projectData) return null

  // Fetch company with notification prefs + Stripe Connect status (Phase 70)
  const { data: companyData } = await supabase
    .from('companies')
    .select(
      'id, name, owner_name, phone, email, website, address, city, state, zip, logo_url, brand_primary_color, notify_on_view, notify_on_accept, notify_on_decline, stripe_account_id, stripe_connect_status'
    )
    .eq('id', estimate.company_id)
    .single()

  if (!companyData) return null

  // Extract client from project join (Supabase returns it as array or object)
  const clientRaw = projectData.client as
    | {
        name: string
        email: string | null
        phone: string | null
        address: string | null
        city: string | null
        state: string | null
        zip: string | null
      }[]
    | {
        name: string
        email: string | null
        phone: string | null
        address: string | null
        city: string | null
        state: string | null
        zip: string | null
      }
    | null

  const client = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw

  // Phase 70 — surface payment fields and derive cents total from `estimate.total`
  // (which is stored in dollars as numeric). Use Math.round to avoid float drift.
  const estimateRaw = estimateData as Record<string, unknown>
  const payment_status =
    typeof estimateRaw.payment_status === 'string'
      ? (estimateRaw.payment_status as string)
      : 'unpaid'
  const stripe_checkout_session_id =
    (estimateRaw.stripe_checkout_session_id as string | null) ?? null
  const paid_at = (estimateRaw.paid_at as string | null) ?? null
  const payment_amount_cents =
    (estimateRaw.payment_amount_cents as number | null) ?? null
  const totalDollars = Number(estimate.total ?? 0)
  const total_amount_cents = Number.isFinite(totalDollars)
    ? Math.round(totalDollars * 100)
    : 0

  return {
    estimate: {
      ...estimateWithSections,
      project: {
        name: projectData.name as string,
        project_type: projectData.project_type as string | null,
      },
      company: companyData as ShareEstimateData['estimate']['company'],
      payment_status,
      total_amount_cents,
      stripe_checkout_session_id,
      paid_at,
      payment_amount_cents,
    },
    client,
  }
}
