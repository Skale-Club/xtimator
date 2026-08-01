'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'
import { getAttachedPhotoIds } from '@/lib/queries/estimate-photo'
import { isEstimateLocked } from '@/lib/estimate/lock'

const ESTIMATE_LOCKED_ERROR =
  'Estimate has been delivered and is locked; create a new version to make changes'

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

/**
 * Security-hardening S3 (audit finding B) — photo lock guard. Photo URLs are
 * deliberately NOT frozen into the signed snapshot (lib/estimate/signed-
 * snapshot.ts), so mutating the attached photo set on a locked/signed
 * estimate would silently change what the client-facing share page/PDF
 * renders after delivery. Mirrors the two-part check in
 * app/api/estimates/[id]/refine/route.ts: isEstimateLocked covers
 * sent_at/client_response, and the separate estimate_signatures lookup
 * covers the signed-but-unresponded window (sign/route.ts inserts the
 * signature BEFORE respondToEstimate and swallows a respond failure, so a
 * signature can exist while client_response is still null).
 */
async function assertPhotoMutationAllowed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  estimateId: string
): Promise<{ error: string } | { estimate: { project_id: string | null } | null }> {
  const { data: estimate } = await supabase
    .from('estimates')
    .select('project_id, sent_at, client_response')
    .eq('id', estimateId)
    .single()

  const { data: signatureRows } = await supabase
    .from('estimate_signatures')
    .select('id')
    .eq('estimate_id', estimateId)
    .limit(1)
  const hasSignature = !!signatureRows && signatureRows.length > 0

  if (isEstimateLocked(estimate) || hasSignature) {
    return { error: ESTIMATE_LOCKED_ERROR }
  }

  return { estimate: estimate ?? null }
}

export async function addPhotoToEstimate(estimateId: string, photoId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const guard = await assertPhotoMutationAllowed(supabase, estimateId)
  if ('error' in guard) return { error: guard.error }

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

  if (guard.estimate?.project_id) revalidatePath(`/projects/${guard.estimate.project_id}`)

  return { data: true }
}

export async function removePhotoFromEstimate(estimateId: string, photoId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const guard = await assertPhotoMutationAllowed(supabase, estimateId)
  if ('error' in guard) return { error: guard.error }

  const { error } = await supabase
    .from('estimate_photos')
    .delete()
    .eq('estimate_id', estimateId)
    .eq('photo_id', photoId)
  if (error) return { error: 'Failed to remove photo from estimate' }

  if (guard.estimate?.project_id) revalidatePath(`/projects/${guard.estimate.project_id}`)

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
