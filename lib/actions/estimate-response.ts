'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { billingEditDenied } from '@/lib/billing/access-guard'
import { assertWritable, assertCompanyWritable } from '@/lib/demo/guard'

// ---------------------------------------------------------------------------
// recordClientResponse - the owner records the client's answer inside the app
// (phone / in-person acceptance, or a company without online approval).
//
// Writes the same columns the public page writes (client_response +
// responded_at), so the dashboard, the content lock and the project status all
// follow. Differences from respondToEstimate:
//  - no owner notification email (the owner did it themselves);
//  - the activity row carries metadata { source: 'manual' };
//  - `null` clears the answer (undo), which the public path never does;
//  - refused when a signature row exists: a signed acceptance is evidence and
//    cannot be overridden or cleared.
//
// updated_at: the estimates BEFORE UPDATE trigger restamps it. This action
// does NOT write it; it returns the trigger's new value so the editor can
// re-baseline its compare-and-set token (no spurious conflict on the next save).
// ---------------------------------------------------------------------------

export type RecordClientResponseResult = {
  success: boolean
  error?: string
  data?: {
    client_response: 'accepted' | 'declined' | null
    responded_at: string | null
    updated_at: string | null
  }
}

export async function recordClientResponse(
  estimateId: string,
  response: 'accepted' | 'declined' | null
): Promise<RecordClientResponseResult> {
  if (typeof estimateId !== 'string' || !estimateId) {
    return { success: false, error: 'Invalid estimate id' }
  }
  if (response !== null && response !== 'accepted' && response !== 'declined') {
    return { success: false, error: 'Invalid response' }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return { success: false, error: 'Not authenticated' }

  const denied = await assertWritable()
  if (denied) return { success: false, error: denied.error }

  const companyId = await getActiveCompanyId()
  if (!companyId) return { success: false, error: 'No company found' }

  const companyDenied = await assertCompanyWritable(companyId)
  if (companyDenied) return { success: false, error: companyDenied.error }
  const billingDenied = await billingEditDenied(companyId)
  if (billingDenied) return { success: false, error: billingDenied.error }

  // Membership: the estimate must belong to the caller's active company
  // (RLS enforces company membership on top of this explicit scope).
  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, project_id, company_id, is_current, sent_at, client_response')
    .eq('id', estimateId)
    .eq('company_id', companyId)
    .single()

  if (!estimate) return { success: false, error: 'Estimate not found' }

  const est = estimate as {
    id: string
    project_id: string
    company_id: string
    is_current: boolean
    sent_at: string | null
    client_response: string | null
  }

  if (!est.is_current) {
    return { success: false, error: 'Only the current version can be answered' }
  }

  const { data: signature } = await supabase
    .from('estimate_signatures')
    .select('id')
    .eq('estimate_id', est.id)
    .limit(1)
    .maybeSingle()

  if (signature) {
    return { success: false, error: 'This estimate was signed online and cannot be changed' }
  }

  if (est.client_response === response) {
    return { success: true, data: { client_response: response, responded_at: null, updated_at: null } }
  }

  const respondedAt = response ? new Date().toISOString() : null
  const { data: updatedRows, error: updateError } = await supabase
    .from('estimates')
    .update({ client_response: response, responded_at: respondedAt })
    .eq('id', est.id)
    .eq('company_id', companyId)
    .select('id, updated_at')

  if (updateError || !updatedRows || updatedRows.length === 0) {
    return { success: false, error: 'Failed to record the response' }
  }
  const newUpdatedAt = (updatedRows[0] as { updated_at?: string }).updated_at ?? null

  // Keep the project status aligned with the answer (same as the public page);
  // clearing returns it to what the estimate's own lifecycle implies.
  await supabase
    .from('projects')
    .update({ status: response ?? (est.sent_at ? 'sent' : 'estimate_ready') })
    .eq('id', est.project_id)

  await supabase.from('estimate_activity').insert({
    project_id: est.project_id,
    company_id: est.company_id,
    estimate_id: est.id,
    event_type: response ? `estimate_${response}` : 'estimate_response_cleared',
    metadata: { source: 'manual' },
  })

  // SEED-057 E3: an ACCEPTED estimate's prices become the company's own price
  // history; taking the acceptance back (declined / cleared) withdraws them.
  // Best-effort and lazy-loaded: it can never fail or slow the response itself.
  try {
    const history = await import('@/lib/estimate/pricing/company-history')
    if (response === 'accepted') await history.recordAcceptedEstimatePrices(est.id)
    else await history.forgetEstimatePrices(est.id)
  } catch {
    // history is an enhancement
  }

  revalidatePath(`/projects/${est.project_id}`)
  revalidatePath('/dashboard')

  return {
    success: true,
    data: { client_response: response, responded_at: respondedAt, updated_at: newUpdatedAt },
  }
}
