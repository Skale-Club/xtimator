import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'

export type BillingOperation = {
  id: string
  company_id: string
  kind: 'credit_purchase' | 'subscription_checkout'
  request_key: string
  request: Record<string, unknown>
  status: 'pending' | 'checkout' | 'completed' | 'failed'
  stripe_object_id: string | null
  result: Record<string, unknown>
  created_at: string
}

export async function reserveBillingOperation(
  companyId: string,
  kind: BillingOperation['kind'],
  key: string,
  request: Record<string, unknown>,
): Promise<BillingOperation> {
  const { data, error } = await requireServiceClient().rpc('reserve_billing_operation', {
    p_company_id: companyId, p_kind: kind, p_request_key: key, p_request: request,
  })
  if (error || !data?.id) throw new Error('Could not reserve the payment. No new payment was started.')
  return data as BillingOperation
}

export async function claimBillingOperation(id: string): Promise<string | null> {
  const { data, error } = await requireServiceClient().rpc('claim_billing_operation', { p_id: id })
  if (error) throw new Error('Could not lock the payment attempt')
  return typeof data === 'string' ? data : null
}

export async function saveBillingOperation(
  id: string,
  token: string,
  fields: Partial<Pick<BillingOperation, 'status' | 'stripe_object_id' | 'result'>>,
): Promise<void> {
  let query = requireServiceClient().from('billing_operations')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id).eq('lease_token', token)
  if (fields.status && fields.status !== 'completed') query = query.neq('status', 'completed')
  const { data, error } = await query.select('id').maybeSingle()
  if (error || !data) throw new Error('Could not save the payment attempt')
}

export async function releaseBillingOperation(id: string, token: string): Promise<void> {
  const { error } = await requireServiceClient().from('billing_operations')
    .update({ lease_token: null, lease_until: null }).eq('id', id).eq('lease_token', token)
  if (error) throw new Error('Could not release the payment attempt')
}

/** Stripe only guarantees retaining v1 idempotency results for 24 hours. */
export function canReplayStripeCreate(createdAt: string): boolean {
  return Date.now() - Date.parse(createdAt) < 23 * 60 * 60 * 1000
}

export async function findPendingCreditPurchase(companyId: string): Promise<BillingOperation | null> {
  const { data, error } = await requireServiceClient().from('billing_operations').select('*')
    .eq('company_id', companyId).eq('kind', 'credit_purchase')
    .in('status', ['pending', 'checkout']).order('created_at').limit(1).maybeSingle()
  if (error) throw new Error('Could not check pending payments')
  return data as BillingOperation | null
}

export async function completeCreditPurchase(companyId: string, operationId: string | undefined): Promise<void> {
  if (!operationId) return // historical purchases predate durable reservations
  const { error } = await requireServiceClient().from('billing_operations')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', operationId).eq('company_id', companyId).eq('kind', 'credit_purchase')
  if (error) throw new Error('Could not confirm purchase fulfillment')
}
