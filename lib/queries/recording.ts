import type { SupabaseClient } from '@supabase/supabase-js'

export interface Recording {
  id: string
  project_id: string
  company_id: string
  storage_path: string | null
  duration_seconds: number | null
  transcript: string | null
  created_at: string
}

export async function getProjectRecordings(
  supabase: SupabaseClient,
  projectId: string
): Promise<Recording[]> {
  const { data } = await supabase
    .from('recordings')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  return (data ?? []) as Recording[]
}
