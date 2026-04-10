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
  created_at: string
  client: { id: string; name: string } | null
}

export async function getDashboardStats(
  supabase: SupabaseClient,
  companyId: string
): Promise<DashboardStats> {
  // Total projects
  const { count: totalProjects } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  // Pending estimates (draft or sent, current version)
  const { count: pendingEstimates } = await supabase
    .from('estimates')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_current', true)
    .in('status', ['draft', 'sent'])

  // Accepted estimates (current version, client accepted)
  const { count: acceptedEstimates } = await supabase
    .from('estimates')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_current', true)
    .eq('client_response', 'accepted')

  // Total revenue (sum of accepted estimate totals)
  const { data: acceptedData } = await supabase
    .from('estimates')
    .select('total')
    .eq('company_id', companyId)
    .eq('is_current', true)
    .eq('client_response', 'accepted')

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
  const { data } = await supabase
    .from('projects')
    .select('id, name, project_type, status, total, created_at, client:clients(id, name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    project_type: row.project_type as string | null,
    status: row.status as string,
    total: Number(row.total) || 0,
    created_at: row.created_at as string,
    client: row.client as { id: string; name: string } | null,
  }))
}
