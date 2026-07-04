'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'
import { getAttachedPhotoIds } from '@/lib/queries/estimate-photo'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }
  const company = { id: activeCompanyId }

  const denied = await assertWritable()
  if (denied) return denied

  return { supabase, company }
}

export async function addPhotoToEstimate(estimateId: string, photoId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { data: existing } = await supabase
    .from('estimate_photos')
    .select('id')
    .eq('estimate_id', estimateId)
    .eq('photo_id', photoId)
    .maybeSingle()
  if (existing?.id) return { data: true }

  const { count } = await supabase
    .from('estimate_photos')
    .select('*', { count: 'exact', head: true })
    .eq('estimate_id', estimateId)

  const { error } = await supabase.from('estimate_photos').insert({
    estimate_id: estimateId,
    photo_id: photoId,
    company_id: company.id,
    sort_order: count ?? 0,
  })
  if (error) return { error: 'Failed to attach photo to estimate' }

  const { data: estimate } = await supabase
    .from('estimates')
    .select('project_id')
    .eq('id', estimateId)
    .single()
  if (estimate?.project_id) revalidatePath(`/projects/${estimate.project_id}`)

  return { data: true }
}

export async function removePhotoFromEstimate(estimateId: string, photoId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('estimate_photos')
    .delete()
    .eq('estimate_id', estimateId)
    .eq('photo_id', photoId)
  if (error) return { error: 'Failed to remove photo from estimate' }

  const { data: estimate } = await supabase
    .from('estimates')
    .select('project_id')
    .eq('id', estimateId)
    .single()
  if (estimate?.project_id) revalidatePath(`/projects/${estimate.project_id}`)

  return { data: true }
}

/** Returns just the attached photo ids as a plain array (Set isn't JSON-serializable across the server-action boundary) — used by PhotosTab to seed/refresh its toggle state per active estimate version. */
export async function getAttachedPhotoIdsAction(estimateId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx
  const ids = await getAttachedPhotoIds(supabase, estimateId)
  return { data: Array.from(ids) }
}
