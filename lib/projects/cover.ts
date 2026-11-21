import 'server-only'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverStorage } from '@/lib/storage/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { isDemoSession } from '@/lib/demo/guard'

/**
 * Project thumbnails (XTM-SIDE-PANEL-1, delivery 3).
 *
 * A thumbnail is a 160px WebP (centre crop) stored in the private `photos`
 * bucket under `<company_id>/<project_id>/cover-<uuid>.webp`. Only that KEY is
 * persisted (projects.cover_thumb_path); the URL is built at render time with
 * storageProxyPath('photos', key) on authenticated list pages. A fresh uuid on
 * every write means a changed cover is a new URL (no stale browser cache).
 *
 * The uploaded-image cover is never a `photos` row, so no AI job ever sees it.
 */

export const COVER_SIZE = 160
/** Thumbs a single page load will generate, so a first visit never fans out. */
export const COVER_BACKFILL_LIMIT = 10
/**
 * Candidates looked at per page load. More than the limit because a project
 * with no photo yields nothing and must not starve the ones behind it.
 */
export const COVER_BACKFILL_CANDIDATES = 30

export type CoverMode = 'auto' | 'photo' | 'upload' | 'none'

export async function makeCoverThumb(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize(COVER_SIZE, COVER_SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: 80 })
    .toBuffer()
}

export function coverKey(companyId: string, projectId: string): string {
  return `${companyId}/${projectId}/cover-${randomUUID()}.webp`
}

/** True for a key this module wrote (never a job photo). */
function isCoverKey(companyId: string, key: string): boolean {
  return key.startsWith(`${companyId}/`) && /\/cover-[^/]+\.webp$/.test(key)
}

/** Makes a thumb from raw image bytes and stores it. Returns the new key. */
export async function storeCoverThumb(
  supabase: SupabaseClient,
  companyId: string,
  projectId: string,
  input: Buffer,
): Promise<string> {
  const thumb = await makeCoverThumb(input)
  const key = coverKey(companyId, projectId)
  await serverStorage(supabase).upload('photos', key, thumb, { contentType: 'image/webp', upsert: false })
  return key
}

/** Downloads one project photo object and stores a thumb of it. Returns the new key. */
export async function storeCoverThumbFromPhoto(
  supabase: SupabaseClient,
  companyId: string,
  projectId: string,
  photoStoragePath: string,
): Promise<string> {
  const blob = await serverStorage(supabase).download('photos', photoStoragePath)
  return storeCoverThumb(supabase, companyId, projectId, Buffer.from(await blob.arrayBuffer()))
}

/** Best effort: removes a stored thumb object. Never throws, never touches a non-cover key. */
export async function removeCoverObject(
  supabase: SupabaseClient,
  companyId: string,
  key: string | null | undefined,
): Promise<void> {
  if (!key || !isCoverKey(companyId, key)) return
  try {
    await serverStorage(supabase).delete('photos', key)
  } catch {
    // An orphaned thumb is harmless; the storage orphan sweep removes it later.
  }
}

/** The project's first photo (sort_order, then created_at), or null. */
export async function firstPhoto(
  supabase: SupabaseClient,
  companyId: string,
  projectId: string,
): Promise<{ id: string; storage_path: string } | null> {
  const { data } = await supabase
    .from('photos')
    .select('id, storage_path')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
  const row = (data as { id: string; storage_path: string | null }[] | null)?.[0]
  return row?.storage_path ? { id: row.id, storage_path: row.storage_path } : null
}

/** Storage path of the project's first photo, or null. */
export async function firstPhotoPath(
  supabase: SupabaseClient,
  companyId: string,
  projectId: string,
): Promise<string | null> {
  return (await firstPhoto(supabase, companyId, projectId))?.storage_path ?? null
}

/**
 * Generates the missing automatic thumbs. Runs after the response (see
 * scheduleCoverBackfill), with a service client because the request's cookies
 * are not available there; every query is scoped by company_id. The write is a
 * conditional UPDATE (still auto, still empty), so a concurrent change by the
 * owner wins; when nothing was updated the new object is removed. Never throws.
 */
export async function fillMissingCovers(companyId: string, projectIds: string[]): Promise<void> {
  try {
    const ids = projectIds.slice(0, COVER_BACKFILL_CANDIDATES)
    if (ids.length === 0) return
    const supabase = requireServiceClient() as unknown as SupabaseClient
    let generated = 0
    for (const projectId of ids) {
      if (generated >= COVER_BACKFILL_LIMIT) break
      try {
        const photo = await firstPhoto(supabase, companyId, projectId)
        if (!photo) continue
        const key = await storeCoverThumbFromPhoto(supabase, companyId, projectId, photo.storage_path)
        generated += 1
        // cover_photo_id records which photo the automatic thumb came from, so
        // deleting that photo clears the thumb (releaseCoverOfDeletedPhoto).
        const { data, error } = await supabase
          .from('projects')
          .update({ cover_thumb_path: key, cover_photo_id: photo.id })
          .eq('id', projectId)
          .eq('company_id', companyId)
          .eq('cover_mode', 'auto')
          .is('cover_thumb_path', null)
          .select('id')
        if (error || !data || data.length === 0) {
          await removeCoverObject(supabase, companyId, key)
        }
      } catch (err) {
        console.warn('[project-cover] backfill failed for one project', {
          projectId,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
  } catch (err) {
    console.warn('[project-cover] backfill aborted', err instanceof Error ? err.message : String(err))
  }
}

interface CoverRow {
  id: string
  cover_mode?: string | null
  cover_thumb_path?: string | null
}

/**
 * Call from the page that lists projects: schedules fillMissingCovers for the
 * projects that are automatic and have no thumb yet. The demo check runs
 * here, inside the request (after() callbacks cannot read request cookies).
 */
export async function scheduleCoverBackfill(companyId: string, rows: CoverRow[]): Promise<void> {
  try {
    const ids = rows
      .filter((row) => (row.cover_mode ?? 'auto') === 'auto' && !row.cover_thumb_path)
      .slice(0, COVER_BACKFILL_CANDIDATES)
      .map((row) => row.id)
    if (ids.length === 0) return
    if (await isDemoSession()) return
    after(() => fillMissingCovers(companyId, ids))
  } catch {
    // The list must render even when scheduling fails.
  }
}

/**
 * Call BEFORE deleting a photo row (the FK nulls cover_photo_id on delete, which
 * would hide the link): returns the project whose thumb came from it, picked
 * by the owner ('photo') or chosen automatically ('auto').
 */
export async function findProjectCoveredByPhoto(
  supabase: SupabaseClient,
  companyId: string,
  photoId: string,
): Promise<{ id: string; cover_thumb_path: string | null } | null> {
  try {
    const { data } = await supabase
      .from('projects')
      .select('id, cover_thumb_path')
      .eq('company_id', companyId)
      .in('cover_mode', ['auto', 'photo'])
      .eq('cover_photo_id', photoId)
      .limit(1)
    return (data as { id: string; cover_thumb_path: string | null }[] | null)?.[0] ?? null
  } catch {
    return null
  }
}

/**
 * After the cover photo was deleted: the project goes back to automatic and
 * its thumb is cleared; the next list load regenerates it from the next photo.
 * Never throws.
 */
export async function releaseCoverOfDeletedPhoto(
  supabase: SupabaseClient,
  companyId: string,
  project: { id: string; cover_thumb_path: string | null },
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .update({ cover_mode: 'auto', cover_photo_id: null, cover_thumb_path: null })
      .eq('id', project.id)
      .eq('company_id', companyId)
      .select('id')
    if (!error && data && data.length > 0) {
      await removeCoverObject(supabase, companyId, project.cover_thumb_path)
    }
  } catch {
    // The cover stays as it was; the photo deletion already succeeded.
  }
}
