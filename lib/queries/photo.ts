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
  /** Display-only zoom/drag crop for the grid thumbnail — never affects the
   * stored bytes; AI photo analysis always reads the full original. */
  position: { scale: number; x: number; y: number } | null
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
