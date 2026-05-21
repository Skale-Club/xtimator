import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProjectDetail {
  id: string
  company_id: string
  name: string
  project_type: string | null
  status: string
  target_budget: number | null
  total: number
  created_at: string
  client: {
    id: string
    name: string
    email: string | null
    phone: string | null
  } | null
}

export async function getProjectById(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectDetail | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, client:clients(id, name, email, phone)')
    .eq('id', projectId)
    .single()

  if (error) {
    console.error('[getProjectById] supabase error', {
      projectId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
  }

  return data ?? null
}

export interface ActivityEvent {
  id: string
  event_type: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export async function getProjectActivity(
  supabase: SupabaseClient,
  projectId: string
): Promise<ActivityEvent[]> {
  const { data } = await supabase
    .from('estimate_activity')
    .select('id, event_type, metadata, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  return data ?? []
}

export interface ProjectQuickStats {
  recordingCount: number
  photoCount: number
  estimateCount: number
}

export async function getProjectQuickStats(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectQuickStats> {
  const [recordings, photos, estimates] = await Promise.all([
    supabase
      .from('recordings')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
    supabase
      .from('photos')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
    supabase
      .from('estimates')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
  ])

  return {
    recordingCount: recordings.count ?? 0,
    photoCount: photos.count ?? 0,
    estimateCount: estimates.count ?? 0,
  }
}

export interface ProjectSummary {
  id: string
  name: string
  status: string
  created_at: string
}

export async function getProjectsByCompany(
  supabase: SupabaseClient,
  companyId: string,
  page = 1,
  limit = 10
): Promise<{ projects: ProjectSummary[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, status, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (error || !data) return { projects: [], hasMore: false }
  return { projects: data as ProjectSummary[], hasMore: data.length === limit }
}
