import type { SupabaseClient } from '@supabase/supabase-js'
import type { Photo } from './photo'

/** Attached Photo rows for this estimate version, ordered by sort_order. */
export async function getEstimatePhotos(
  supabase: SupabaseClient,
  estimateId: string
): Promise<Photo[]> {
  const { data } = await supabase
    .from('estimate_photos')
    .select('sort_order, photo:photos(*)')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: true })

  if (!data) return []
  return data
    .map((row) => row.photo as unknown as Photo | null)
    .filter((p): p is Photo => p !== null)
}

/** Cheap existence check — the set of photo_ids attached to this estimate, for gallery toggle state. */
export async function getAttachedPhotoIds(
  supabase: SupabaseClient,
  estimateId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from('estimate_photos')
    .select('photo_id')
    .eq('estimate_id', estimateId)
  return new Set((data ?? []).map((row) => row.photo_id as string))
}

/** Copies every estimate_photos row from one estimate to another (version carry-forward). No-op if source has none. */
export async function copyEstimatePhotos(
  supabase: SupabaseClient,
  fromEstimateId: string,
  toEstimateId: string,
  companyId: string
): Promise<void> {
  const { data } = await supabase
    .from('estimate_photos')
    .select('photo_id, sort_order')
    .eq('estimate_id', fromEstimateId)
  if (!data || data.length === 0) return
  await supabase.from('estimate_photos').insert(
    data.map((row) => ({
      estimate_id: toEstimateId,
      photo_id: row.photo_id,
      company_id: companyId,
      sort_order: row.sort_order,
    }))
  )
}
