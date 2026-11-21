'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { billingEditDenied } from '@/lib/billing/access-guard'
import { assertWritable } from '@/lib/demo/guard'
import { storageProxyPath } from '@/lib/storage/asset-url'
import {
  firstPhoto,
  removeCoverObject,
  storeCoverThumb,
  storeCoverThumbFromPhoto,
  type CoverMode,
} from '@/lib/projects/cover'

/**
 * Project thumbnails: pick a project photo, upload an image only for the
 * thumbnail, go back to the automatic one (first photo) or remove it.
 * Every write: getAuthContext -> assertWritable -> billingEditDenied, scopes
 * each query by company_id, updates the row first and removes the previous
 * thumb object only after that succeeded.
 */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  return { supabase, company: { id: activeCompanyId } }
}

type Supabase = Awaited<ReturnType<typeof createClient>>

interface OwnedProject {
  id: string
  cover_mode: CoverMode
  cover_thumb_path: string | null
  cover_photo_id: string | null
}

async function loadOwnedProject(
  supabase: Supabase,
  companyId: string,
  projectId: string,
): Promise<OwnedProject | null> {
  const { data } = await supabase
    .from('projects')
    .select('id, cover_mode, cover_thumb_path, cover_photo_id')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .maybeSingle()
  return (data as OwnedProject | null) ?? null
}

/** Writes the new cover fields; on failure the freshly stored object is removed. */
async function commitCover(
  supabase: Supabase,
  companyId: string,
  project: OwnedProject,
  patch: { cover_mode: CoverMode; cover_photo_id: string | null; cover_thumb_path: string | null },
): Promise<{ error: string } | null> {
  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', project.id)
    .eq('company_id', companyId)
    .select('id')
  if (error || !data || data.length === 0) {
    await removeCoverObject(supabase, companyId, patch.cover_thumb_path)
    return { error: 'Failed to update the thumbnail.' }
  }
  if (project.cover_thumb_path && project.cover_thumb_path !== patch.cover_thumb_path) {
    await removeCoverObject(supabase, companyId, project.cover_thumb_path)
  }
  return null
}

export async function setProjectCoverFromPhoto(projectId: string, photoId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const denied = await assertWritable()
  if (denied) return denied
  const billingDenied = await billingEditDenied(ctx.company.id)
  if (billingDenied) return billingDenied
  const { supabase, company } = ctx

  const project = await loadOwnedProject(supabase, company.id, projectId)
  if (!project) return { error: 'Project not found.' }

  const { data: photo } = await supabase
    .from('photos')
    .select('id, storage_path')
    .eq('id', photoId)
    .eq('project_id', projectId)
    .eq('company_id', company.id)
    .maybeSingle()
  const photoPath = (photo as { storage_path: string | null } | null)?.storage_path
  if (!photoPath) return { error: 'Photo not found.' }

  let key: string
  try {
    key = await storeCoverThumbFromPhoto(supabase, company.id, projectId, photoPath)
  } catch {
    return { error: 'Could not create the thumbnail.' }
  }
  const failed = await commitCover(supabase, company.id, project, {
    cover_mode: 'photo',
    cover_photo_id: photoId,
    cover_thumb_path: key,
  })
  if (failed) return failed

  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return { data: { cover_mode: 'photo' as const } }
}

export async function uploadProjectCover(projectId: string, formData: FormData) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const denied = await assertWritable()
  if (denied) return denied
  const billingDenied = await billingEditDenied(ctx.company.id)
  if (billingDenied) return billingDenied
  const { supabase, company } = ctx

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file provided.' }
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { error: 'Unsupported image format. Please upload a PNG, JPG, or WebP file.' }
  }
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'This image is too large. Choose a smaller one.' }

  const project = await loadOwnedProject(supabase, company.id, projectId)
  if (!project) return { error: 'Project not found.' }

  // The upload becomes ONLY the 160px thumb. It is deliberately not inserted
  // into `photos`, so no AI job can ever read it.
  let key: string
  try {
    key = await storeCoverThumb(supabase, company.id, projectId, Buffer.from(await file.arrayBuffer()))
  } catch {
    return { error: 'This image could not be read. Choose another one.' }
  }
  const failed = await commitCover(supabase, company.id, project, {
    cover_mode: 'upload',
    cover_photo_id: null,
    cover_thumb_path: key,
  })
  if (failed) return failed

  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return { data: { cover_mode: 'upload' as const } }
}

export async function removeProjectCover(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const denied = await assertWritable()
  if (denied) return denied
  const billingDenied = await billingEditDenied(ctx.company.id)
  if (billingDenied) return billingDenied
  const { supabase, company } = ctx

  const project = await loadOwnedProject(supabase, company.id, projectId)
  if (!project) return { error: 'Project not found.' }

  const failed = await commitCover(supabase, company.id, project, {
    cover_mode: 'none',
    cover_photo_id: null,
    cover_thumb_path: null,
  })
  if (failed) return failed

  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return { data: { cover_mode: 'none' as const } }
}

export async function resetProjectCover(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const denied = await assertWritable()
  if (denied) return denied
  const billingDenied = await billingEditDenied(ctx.company.id)
  if (billingDenied) return billingDenied
  const { supabase, company } = ctx

  const project = await loadOwnedProject(supabase, company.id, projectId)
  if (!project) return { error: 'Project not found.' }

  // Back to automatic: the first photo, or nothing yet (the next list load
  // fills it in as soon as the project has a photo).
  let key: string | null = null
  let sourcePhotoId: string | null = null
  try {
    const photo = await firstPhoto(supabase, company.id, projectId)
    if (photo) {
      key = await storeCoverThumbFromPhoto(supabase, company.id, projectId, photo.storage_path)
      sourcePhotoId = photo.id
    }
  } catch {
    key = null
    sourcePhotoId = null
  }
  const failed = await commitCover(supabase, company.id, project, {
    cover_mode: 'auto',
    cover_photo_id: sourcePhotoId,
    cover_thumb_path: key,
  })
  if (failed) return failed

  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return { data: { cover_mode: 'auto' as const } }
}

/** Read-only: the project's photos for the picker, plus the current choice. */
export async function listProjectCoverPhotos(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const project = await loadOwnedProject(supabase, company.id, projectId)
  if (!project) return { error: 'Project not found.' }

  const { data } = await supabase
    .from('photos')
    .select('id, storage_path')
    .eq('company_id', company.id)
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(100)

  const photos = ((data ?? []) as { id: string; storage_path: string | null }[])
    .filter((row) => !!row.storage_path)
    .map((row) => ({ id: row.id, url: storageProxyPath('photos', row.storage_path as string) }))

  return { data: { mode: project.cover_mode, coverPhotoId: project.cover_photo_id, photos } }
}
