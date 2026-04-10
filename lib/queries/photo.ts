import type { SupabaseClient } from '@supabase/supabase-js'

export interface Photo {
  id: string
  project_id: string
  company_id: string
  storage_path: string
  caption: string | null
  ai_description: string | null
  sort_order: number
  created_at: string
}

export async function getProjectPhotos(
  supabase: SupabaseClient,
  projectId: string
): Promise<Photo[]> {
  const { data } = await supabase
    .from('photos')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  return (data ?? []) as Photo[]
}
