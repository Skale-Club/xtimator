import type { SupabaseClient } from '@supabase/supabase-js'

export interface ClientWithCount {
  id: string
  name: string
  email: string | null
  phone: string | null
  logo_url: string | null
  created_at: string
  project_count: number
}

export interface ClientDetail extends ClientWithCount {
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
  /** Phase 52: client-level preferred estimate language. Null means inherit from company. */
  preferred_language: string | null
}

/** Per-client activity the Clients list shows, derived from the client's projects. */
export interface ClientStats {
  /** Sum of the projects' estimate totals (same figure as the client page's Total value). */
  total_value: number
  /** created_at of the client's newest project, or null with no project. */
  last_activity_at: string | null
}

export type ClientListItem = ClientDetail & ClientStats

export async function getClients(
  supabase: SupabaseClient,
  companyId: string
): Promise<ClientWithCount[]> {
  return loadClientsWithCounts<Omit<ClientWithCount, 'project_count'>>(
    supabase, companyId, 'id, name, email, phone, logo_url, created_at',
  )
}

/** Load editable fields once, so opening an editor requires no extra request. */
export async function getClientsForEditing(
  supabase: SupabaseClient,
  companyId: string,
): Promise<ClientListItem[]> {
  return loadClientsWithCounts<Omit<ClientDetail, 'project_count'>>(
    supabase, companyId,
    'id, name, email, phone, logo_url, created_at, address, city, state, zip, notes, preferred_language',
  )
}

async function loadClientsWithCounts<T extends Omit<ClientWithCount, 'project_count'>>(
  supabase: SupabaseClient,
  companyId: string,
  columns: string,
): Promise<Array<T & { project_count: number } & ClientStats>> {
  // Both queries only filter by companyId and are independent — run them in
  // parallel instead of clients-then-projects in series (one fewer round-trip
  // on the clients list page).
  const [{ data: clients }, { data: projects }] = await Promise.all([
    supabase
      .from('clients')
      .select(columns)
      .eq('company_id', companyId)
      .order('name'),
    supabase
      .from('projects')
      .select('client_id, total, created_at')
      .eq('company_id', companyId),
  ])

  if (!clients || clients.length === 0) return []

  // One pass over the company's projects: count, total value and newest date per client.
  const statsMap = new Map<string, { count: number; total: number; last: string | null }>()
  for (const p of (projects ?? []) as Array<{ client_id: string | null; total?: number | null; created_at?: string | null }>) {
    if (!p.client_id) continue
    const s = statsMap.get(p.client_id) ?? { count: 0, total: 0, last: null }
    s.count += 1
    s.total += Number(p.total ?? 0) || 0
    if (p.created_at && (!s.last || p.created_at > s.last)) s.last = p.created_at
    statsMap.set(p.client_id, s)
  }

  return (clients as unknown as T[]).map((c) => {
    const s = statsMap.get(c.id)
    return {
      ...c,
      project_count: s?.count ?? 0,
      total_value: s?.total ?? 0,
      last_activity_at: s?.last ?? null,
    }
  })
}

export async function getClientById(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientDetail | null> {
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (!client) return null

  const { count } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)

  return {
    ...client,
    project_count: count ?? 0,
  }
}

export async function getClientProjects(
  supabase: SupabaseClient,
  clientId: string
) {
  const { data } = await supabase
    .from('projects')
    .select('id, name, project_type, status, total, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  return data ?? []
}
