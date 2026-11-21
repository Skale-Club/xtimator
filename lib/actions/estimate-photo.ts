'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'
import { billingEditDenied } from '@/lib/billing/access-guard'
import { getAttachedPhotoIds } from '@/lib/queries/estimate-photo'
import { isEstimateLocked } from '@/lib/estimate/lock'

const ESTIMATE_LOCKED_ERROR =
  'This estimate was answered by the client and is locked. If it was declined, revise and reopen it; if it was accepted, add a change order.'

const ESTIMATE_NOT_FOUND_ERROR = 'Estimate not found'
const ESTIMATE_NOT_CURRENT_ERROR = 'This version was superseded, so its photos can no longer change.'

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
 * client_response (lock-at-acceptance: sending alone does not lock), and the separate estimate_signatures lookup
 * covers the signed-but-unresponded window (sign/route.ts inserts the
 * signature BEFORE respondToEstimate and swallows a respond failure, so a
 * signature can exist while client_response is still null).
 */
async function assertPhotoMutationAllowed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  estimateId: string,
  companyId: string
): Promise<{ error: string } | { estimate: { project_id: string | null; updated_at: string | null } }> {
  // company_id filter: the caller may only touch an estimate of their own
  // company (RLS already scopes the read; this keeps the guard explicit and
  // makes a foreign or missing id fail closed instead of passing as "unlocked").
  const { data: estimate } = await supabase
    .from('estimates')
    .select('project_id, client_response, is_current, updated_at')
    .eq('id', estimateId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!estimate) return { error: ESTIMATE_NOT_FOUND_ERROR }

  // A superseded version is history: its photo set is frozen like the rest of
  // its content (saveEstimate refuses it the same way, SAVE-02).
  if ((estimate as { is_current?: boolean | null }).is_current === false) {
    return { error: ESTIMATE_NOT_CURRENT_ERROR }
  }

  const { data: signatureRows } = await supabase
    .from('estimate_signatures')
    .select('id')
    .eq('estimate_id', estimateId)
    .limit(1)
  const hasSignature = !!signatureRows && signatureRows.length > 0

  if (isEstimateLocked(estimate) || hasSignature) {
    return { error: ESTIMATE_LOCKED_ERROR }
  }

  const row = estimate as { project_id: string | null; updated_at?: string | null }
  return { estimate: { project_id: row.project_id ?? null, updated_at: row.updated_at ?? null } }
}

/**
 * The estimate's content version after the mutation. Returned together with the
 * version BEFORE it (previous_updated_at) so the editor adopts the new token only
 * when the version it holds is the one this call started from: if another device
 * saved in between, adopting would hide a real conflict. A read, never a write.
 */
async function readUpdatedAt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  estimateId: string,
  companyId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('estimates')
    .select('updated_at')
    .eq('id', estimateId)
    .eq('company_id', companyId)
    .maybeSingle()
  return (data as { updated_at?: string | null } | null)?.updated_at ?? null
}

export async function addPhotoToEstimate(estimateId: string, photoId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  // SEED-055 Phase D: a paywalled company is read-only.
  const billingDenied = await billingEditDenied(company.id)
  if (billingDenied) return billingDenied

  const guard = await assertPhotoMutationAllowed(supabase, estimateId, company.id)
  if ('error' in guard) return { error: guard.error }

  const { data: existing } = await supabase
    .from('estimate_photos')
    .select('id')
    .eq('estimate_id', estimateId)
    .eq('photo_id', photoId)
    .maybeSingle()
  if (existing?.id) {
    return {
      data: true,
      updated_at: await readUpdatedAt(supabase, estimateId, company.id),
      previous_updated_at: guard.estimate.updated_at,
    }
  }

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

  if (guard.estimate.project_id) revalidatePath(`/projects/${guard.estimate.project_id}`)

  return {
    data: true,
    updated_at: await readUpdatedAt(supabase, estimateId, company.id),
    previous_updated_at: guard.estimate.updated_at,
  }
}

export async function removePhotoFromEstimate(estimateId: string, photoId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  const billingDenied = await billingEditDenied(company.id)
  if (billingDenied) return billingDenied

  const guard = await assertPhotoMutationAllowed(supabase, estimateId, company.id)
  if ('error' in guard) return { error: guard.error }

  const { error } = await supabase
    .from('estimate_photos')
    .delete()
    .eq('estimate_id', estimateId)
    .eq('photo_id', photoId)
  if (error) return { error: 'Failed to remove photo from estimate' }

  if (guard.estimate.project_id) revalidatePath(`/projects/${guard.estimate.project_id}`)

  return {
    data: true,
    updated_at: await readUpdatedAt(supabase, estimateId, company.id),
    previous_updated_at: guard.estimate.updated_at,
  }
}

/** Returns just the attached photo ids as a plain array (Set isn't JSON-serializable across the server-action boundary) — used by PhotosTab to seed/refresh its toggle state per active estimate version. */
export async function getAttachedPhotoIdsAction(estimateId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx
  const ids = await getAttachedPhotoIds(supabase, estimateId)
  return { data: Array.from(ids) }
}
