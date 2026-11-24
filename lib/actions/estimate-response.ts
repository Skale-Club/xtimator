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
    .select('id, project_id, company_id, is_current, sent_at, client_response, updated_at')
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
    updated_at: string
  }

  if (!est.is_current) {
    return { success: false, error: 'Only the current version can be answered' }
  }

  // The evidence check, response, project status and activity share the same
  // transaction/row lock as online signing. A separate precheck can race a signer.
  const { data: result, error: updateError } = await supabase.rpc('record_estimate_response_atomic', {
    p_estimate_id: est.id,
    p_company_id: companyId,
    p_expected_updated_at: est.updated_at,
    p_response: response,
  })
  if (updateError || !result) {
    const code = updateError?.code
    const error = code === 'P0022'
      ? 'This estimate was signed online or has approved changes and cannot be changed'
      : code === 'P0002' ? 'This estimate changed. Reload before recording a response.'
      : code === 'P0003' ? 'Only the current version can be answered'
      : 'Failed to record the response'
    return { success: false, error }
  }
  const committed = result as { client_response: 'accepted' | 'declined' | null; responded_at: string | null; updated_at: string }

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
    data: { client_response: committed.client_response, responded_at: committed.responded_at, updated_at: committed.updated_at },
  }
}
