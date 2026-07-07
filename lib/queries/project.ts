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
  /**
   * QUICK-psh-01/02: classification + clarifying questions persisted once at
   * the final vague terminal (lib/estimate/adapters/default.ts). Read by the
   * project-page needs-details banner when status === 'awaiting_details'.
   */
  needs_details: {
    reason: string
    questions: string[]
    attempt_id: string
    created_at: string
  } | null
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

/**
 * Quick task 260522-lhp (QUICK-LHP-BE-02) — Status-aware project list query for /projects page.
 *
 * Branches on the requested status:
 *   - 'active'   → archived_at IS NULL AND deleted_at IS NULL
 *   - 'archived' → archived_at IS NOT NULL AND deleted_at IS NULL
 *   - 'trash'    → deleted_at IS NOT NULL
 *
 * Optionally filtered by client_id (null/undefined = unfiltered).
 *
 * RLS scopes rows to the user's company; we still pass company_id explicitly so the partial
 * indexes are hit (idx_projects_active_by_company is on (company_id, created_at DESC) with
 * the active partial predicate).
 */
export type ProjectListStatus = 'active' | 'archived' | 'trash'

export interface ProjectListRow {
  id: string
  name: string
  project_type: string | null
  status: string
  total: number
  created_at: string
  archived_at: string | null
  deleted_at: string | null
  client: { id: string; name: string } | null
}

interface ProjectListRowRaw {
  id: string
  name: string
  project_type: string | null
  status: string
  total: number | string | null
  created_at: string
  archived_at: string | null
  deleted_at: string | null
  client: { id: string; name: string } | { id: string; name: string }[] | null
}

export async function getProjectsForListPage(
  supabase: SupabaseClient,
  companyId: string,
  opts: { status: ProjectListStatus; clientId?: string | null }
): Promise<ProjectListRow[]> {
  let q = supabase
    .from('projects')
    .select('id, name, project_type, status, total, created_at, archived_at, deleted_at, client:clients(id, name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (opts.status === 'active') {
    q = q.is('archived_at', null).is('deleted_at', null)
  } else if (opts.status === 'archived') {
    q = q.not('archived_at', 'is', null).is('deleted_at', null)
  } else {
    // 'trash'
    q = q.not('deleted_at', 'is', null)
  }

  if (opts.clientId) {
    q = q.eq('client_id', opts.clientId)
  }

  const { data, error } = await q
  if (error) {
    console.error('[getProjectsForListPage] supabase error', {
      companyId,
      status: opts.status,
      clientId: opts.clientId ?? null,
      code: error.code,
      message: error.message,
    })
    return []
  }

  // Supabase JS types the relation as an array OR single — narrow to single since clients(id) is FK.
  const rows = (data ?? []) as unknown as ProjectListRowRaw[]
  return rows.map((row) => {
    const c = row.client
    const client = Array.isArray(c) ? (c[0] ?? null) : c
    return {
      id: row.id,
      name: row.name,
      project_type: row.project_type,
      status: row.status,
      total: Number(row.total) || 0,
      created_at: row.created_at,
      archived_at: row.archived_at,
      deleted_at: row.deleted_at,
      client,
    }
  })
}
