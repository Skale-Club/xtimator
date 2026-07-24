'use server'

import { createClient } from '@/lib/supabase/server'
import { createStorage } from '@/lib/storage'
import { convertImageToWebp } from '@/lib/image/webp'
import { revalidatePath } from 'next/cache'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  // getActiveCompanyId() already validated membership (company_members FK →
  // companies), so the company row provably exists — skip a redundant SELECT.
  const company = { id: activeCompanyId }

  const denied = await assertWritable()
  if (denied) return denied

  return { supabase, company }
}

// Pre-launch audit fix (A-3): the client caps photo capture at 16
// (capture-recorder.tsx), but that's UI-only — nothing server-side stopped a
// caller from creating hundreds of photo rows for one project, each of which
// the analyze-photos job would otherwise try to run through paid Vision
// analysis (that job now also caps itself at MAX_PHOTOS_PER_JOB=20 — see
// lib/inngest/functions/analyze-photos.ts — but capping creation too avoids
// unbounded row/storage growth from the same abuse path).
const MAX_PHOTOS_PER_PROJECT = 50

export async function createPhoto(
  projectId: string,
  storagePath: string,
  sortOrder: number
) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  if (!storagePath.startsWith(`${company.id}/`)) {
    return { error: 'Invalid photo path.' }
  }

  const { count: existingCount } = await supabase
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
  if ((existingCount ?? 0) >= MAX_PHOTOS_PER_PROJECT) {
    return { error: `This project already has the maximum of ${MAX_PHOTOS_PER_PROJECT} photos.` }
  }

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

/**
 * Server-side upload for a job-site photo. The caller (photo-drop-zone.tsx /
 * capture-recorder.tsx) still does its OWN client-side canvas resize/compress
 * first (crucial for upload speed on a job-site cellular connection — this
 * does NOT change) and hands off the already-small compressed blob here for
 * a WebP re-encode (sharp only runs server-side) before it's stored.
 */
export async function uploadProjectPhoto(
  projectId: string,
  formData: FormData,
  sortOrder: number
) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file provided.' }

  const photoId = crypto.randomUUID()
  const storagePath = `${company.id}/${projectId}/${photoId}.webp`
  const storage = createStorage(supabase)
  try {
    const webpBuffer = await convertImageToWebp(file)
    await storage.upload('photos', storagePath, webpBuffer, { contentType: 'image/webp', upsert: false })
  } catch {
    return { error: 'Failed to upload photo.' }
  }

  return createPhoto(projectId, storagePath, sortOrder)
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
