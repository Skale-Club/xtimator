'use server'

import { createClient } from '@/lib/supabase/server'
import { createStorage } from '@/lib/storage'
import { revalidatePath } from 'next/cache'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) return { error: 'No company found' as const }

  return { supabase, company }
}

export async function createPhoto(
  projectId: string,
  storagePath: string,
  sortOrder: number
) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { data: photo, error: insertError } = await supabase
    .from('photos')
    .insert({
      project_id: projectId,
      company_id: company.id,
      storage_path: storagePath,
      sort_order: sortOrder,
    })
    .select()
    .single()

  if (insertError || !photo) {
    return { error: 'Failed to create photo. Please try again.' }
  }

  // Check if first photo and update project status per D-20
  const { data: project } = await supabase
    .from('projects')
    .select('status')
    .eq('id', projectId)
    .single()

  if (project && (project.status === 'draft' || project.status === 'recording')) {
    const { count } = await supabase
      .from('photos')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)

    if (count === 1) {
      await supabase
        .from('projects')
        .update({ status: 'photos_added' })
        .eq('id', projectId)
    }
  }

  // Log activity
  await supabase.from('estimate_activity').insert({
    project_id: projectId,
    company_id: company.id,
    event_type: 'photo_added',
    metadata: { sort_order: sortOrder },
  })

  revalidatePath(`/projects/${projectId}`)
  return { data: photo }
}

export async function updatePhotoCaption(photoId: string, caption: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('photos')
    .update({ caption })
    .eq('id', photoId)

  if (error) return { error: 'Failed to update caption' }

  return { data: true }
}

export async function deletePhoto(photoId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Get photo for storage_path and project_id
  const { data: photo } = await supabase
    .from('photos')
    .select('storage_path, project_id')
    .eq('id', photoId)
    .single()

  if (!photo) return { error: 'Photo not found' }

  // Delete from Storage photos bucket
  try {
    await createStorage(supabase).delete('photos', photo.storage_path)
  } catch {
    return { error: 'Failed to delete photo file' }
  }

  // Delete DB row
  const { error: dbError } = await supabase
    .from('photos')
    .delete()
    .eq('id', photoId)

  if (dbError) return { error: 'Failed to delete photo' }

  revalidatePath(`/projects/${photo.project_id}`)
  return { data: true }
}

export async function reorderPhotos(photoIds: string[]) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Update sort_order for each photo in parallel
  const updates = photoIds.map((id, index) =>
    supabase
      .from('photos')
      .update({ sort_order: index })
      .eq('id', id)
  )

  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)

  if (failed?.error) return { error: 'Failed to reorder photos' }

  return { data: true }
}
