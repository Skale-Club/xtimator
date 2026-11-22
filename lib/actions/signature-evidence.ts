'use server'

import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { loadSignatureEvidence } from '@/lib/queries/estimate-signature'
import type { SignatureEvidence } from '@/lib/estimate/signature-evidence'

/**
 * "Signature details" in the owner's editor. Read-only: returns the evidence
 * of the estimate's online signature (signer, time, IP, device, hash and the
 * integrity check), or null when it was not signed online.
 *
 * Membership is proven with the caller's own RLS client (the estimate must be
 * visible to them AND belong to their active company) before the service client
 * reads the signature row, because the integrity check needs the full stored
 * snapshot regardless of column grants.
 */
export async function getSignatureEvidence(
  estimateId: string
): Promise<{ data?: SignatureEvidence | null; error?: string }> {
  if (typeof estimateId !== 'string' || !/^[0-9a-f-]{36}$/i.test(estimateId)) {
    return { error: 'Invalid estimate id' }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return { error: 'Not authenticated' }

  const companyId = await getActiveCompanyId()
  if (!companyId) return { error: 'No company found' }

  const { data: estimate } = await supabase
    .from('estimates')
    .select('id')
    .eq('id', estimateId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!estimate) return { error: 'Estimate not found' }

  try {
    return { data: await loadSignatureEvidence(requireServiceClient(), estimateId) }
  } catch {
    return { error: 'Could not load the signature details' }
  }
}
