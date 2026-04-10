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
}

export async function getClients(
  supabase: SupabaseClient,
  companyId: string
): Promise<ClientWithCount[]> {
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, email, phone, logo_url, created_at')
    .eq('company_id', companyId)
    .order('name')

  if (!clients || clients.length === 0) return []

  // Get all project client_id counts in a single query
  const { data: projects } = await supabase
    .from('projects')
    .select('client_id')
    .eq('company_id', companyId)

  const countMap = new Map<string, number>()
  for (const p of projects ?? []) {
    if (p.client_id) {
      countMap.set(p.client_id, (countMap.get(p.client_id) ?? 0) + 1)
    }
  }

  return clients.map((c) => ({
    ...c,
    project_count: countMap.get(c.id) ?? 0,
  }))
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
