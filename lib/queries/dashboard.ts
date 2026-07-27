import type { SupabaseClient } from '@supabase/supabase-js'

export interface DashboardStats {
  totalProjects: number
  pendingEstimates: number
  acceptedEstimates: number
  totalRevenue: number
}

export interface ProjectWithClient {
  id: string
  name: string
  project_type: string | null
  status: string
  total: number
  currency_code?: string
  created_at: string
  client: { id: string; name: string } | null
  /** Phase 70: payment status pulled from the project's current estimate. */
  payment_status: 'unpaid' | 'paid' | 'refunded' | null
  paid_at: string | null
}

export async function getDashboardStats(
  supabase: SupabaseClient,
  companyId: string
): Promise<DashboardStats> {
  // The four aggregates are independent — run them in parallel (one round-trip
  // of latency instead of four sequential ones).
  const [
    { count: totalProjects },
    { count: pendingEstimates },
    { count: acceptedEstimates },
    { data: acceptedData },
  ] = await Promise.all([
    // Total active projects (exclude archived + trashed; mirrors /projects "Active" view
    // filter from getProjectsForListPage in lib/queries/project.ts).
    supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('archived_at', null)
      .is('deleted_at', null),
    // Pending estimates (draft or sent, current version)
    supabase
      .from('estimates')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_current', true)
      .in('status', ['draft', 'sent']),
    // Accepted estimates (current version, client accepted)
    supabase
      .from('estimates')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_current', true)
      .eq('client_response', 'accepted'),
    // Total revenue (sum of accepted estimate totals)
    supabase
      .from('estimates')
      .select('total')
      .eq('company_id', companyId)
      .eq('is_current', true)
      .eq('client_response', 'accepted'),
  ])

  const totalRevenue = (acceptedData ?? []).reduce(
    (sum, row) => sum + (Number(row.total) || 0),
    0
  )

  return {
    totalProjects: totalProjects ?? 0,
    pendingEstimates: pendingEstimates ?? 0,
    acceptedEstimates: acceptedEstimates ?? 0,
    totalRevenue,
  }
}

export async function getProjects(
  supabase: SupabaseClient,
  companyId: string
): Promise<ProjectWithClient[]> {
  // Pull the current estimate's payment_status + paid_at alongside the
  // project so the dashboard list can render a "Paid" badge without an
  // N+1 round-trip (Phase 70-05 polish — CONTEXT.md "Claude's Discretion"
  // green-lit this micro-feature).
  //
  // Intentionally UNBOUNDED (no .limit()): the dashboard "Recent projects" list
  // (components/dashboard/project-list.tsx) filters by status and paginates
  // ENTIRELY client-side over this array, so a server-side cap would silently
  // hide older projects from the "Sent"/"Paid" filters. The full active set is
  // returned; the /projects page uses the separately-paginated
  // getProjectsForListPage instead.
  // (A second consumer, the standalone app/demo/projects/page.tsx, also relied
  // on this; it was deleted in Phase 181 when the demo moved onto the real app.)
  const { data } = await supabase
    .from('projects')
    .select(
      `id, name, project_type, status, total, created_at,
       client:clients(id, name),
       estimates!estimates_project_id_fkey(payment_status, paid_at, currency_code, is_current)`
    )
    .eq('company_id', companyId)
    .is('archived_at', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (data ?? []).map((row: Record<string, unknown>) => {
    const estimates = (row.estimates as Array<{
      payment_status: 'unpaid' | 'paid' | 'refunded' | null
      paid_at: string | null
      currency_code: string | null
      is_current: boolean | null
    }> | null) ?? []
    const current = estimates.find((e) => e.is_current) ?? null
    return {
      id: row.id as string,
      name: row.name as string,
      project_type: row.project_type as string | null,
      status: row.status as string,
      total: Number(row.total) || 0,
      currency_code: current?.currency_code ?? 'USD',
      created_at: row.created_at as string,
      client: row.client as { id: string; name: string } | null,
      payment_status: current?.payment_status ?? null,
      paid_at: current?.paid_at ?? null,
    }
  })
}
