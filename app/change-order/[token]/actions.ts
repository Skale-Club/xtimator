'use server'

/**
 * Client-side (anonymous) actions on a change order's public page.
 * Accepting always goes through the sign route (POST /api/change-orders/[id]/sign)
 * so a signature is captured; this action only declines.
 */
import { requireServiceClient } from '@/lib/supabase/service'
import { assertCompanyWritable, assertWritable } from '@/lib/demo/guard'
import { notifyChangeOrderResponse } from '@/lib/change-orders/notify'
import { resolveEstimateNumber } from '@/lib/change-orders/contract'
import { rateLimit } from '@/lib/ratelimit'
import { sha256Hex } from '@/lib/auth/share-password'
import { readClientIp } from '@/lib/estimates/public-access'

export async function declineChangeOrder(token: string): Promise<{ success: boolean; error?: string }> {
  if (typeof token !== 'string' || !token) return { success: false, error: 'Change order not found' }

  // Throttle FIRST: anonymous, token-gated public write. IP + truncated token hash.
  const ip = await readClientIp()
  const rl = await rateLimit('publicChangeOrderPerMinute', `${ip ?? 'no-ip'}:${sha256Hex(token).slice(0, 16)}`)
  if (!rl.allowed) return { success: false, error: 'Too many attempts. Try again in a minute.' }

  const supabase = requireServiceClient()

  const { data: row } = await supabase
    .from('change_orders')
    .select('id, project_id, company_id, estimate_id, number, title, total, client_response, status')
    .eq('share_token', token)
    .maybeSingle()

  if (!row) return { success: false, error: 'Change order not found' }
  const co = row as {
    id: string
    project_id: string
    company_id: string
    estimate_id: string
    number: number
    title: string | null
    total: number
    client_response: string | null
    status?: string | null
  }

  // A draft has not been sent to the client: the UI hides the buttons, this
  // refuses the call itself.
  if (co.status === 'draft') return { success: false, error: 'This change order has not been sent yet' }

  const denied = (await assertWritable()) ?? (await assertCompanyWritable(co.company_id))
  if (denied) return { success: false, error: denied.error }

  if (co.client_response) {
    return { success: false, error: 'This change order has already been responded to' }
  }

  // Online approval exists ONLY when the company requires a digital signature
  // (same rule as respondToEstimate). When it is off the contractor records the
  // answer inside the app, so this public action refuses. Runs before any write.
  const { data: companyRow } = await supabase
    .from('companies')
    .select('digital_signature_enabled')
    .eq('id', co.company_id)
    .single()
  const signatureEnabled =
    (companyRow as { digital_signature_enabled?: boolean | null } | null)?.digital_signature_enabled === true
  if (!signatureEnabled) {
    return { success: false, error: 'Online responses are not enabled for this change order' }
  }

  // The parent must still be the current, accepted estimate (the contract).
  const { data: parentRow } = await supabase
    .from('estimates')
    .select('id, is_current, client_response, estimate_number, estimate_seq, version, project_id')
    .eq('id', co.estimate_id)
    .maybeSingle()
  const parent = parentRow as {
    is_current: boolean | null
    client_response: string | null
    estimate_number: string | null
    estimate_seq: number | null
    version: number | null
  } | null
  if (!parent || parent.is_current !== true || parent.client_response !== 'accepted') {
    return { success: false, error: 'contract_not_accepted' }
  }

  // Check-and-set: the UPDATE only matches while client_response is STILL null,
  // so a sign request (sign_change_order_atomic also writes client_response) or a
  // second decline that landed after the pre-check above makes this a no-op.
  const { data: updatedRows, error: updateError } = await supabase
    .from('change_orders')
    .update({
      client_response: 'declined',
      responded_at: new Date().toISOString(),
      status: 'declined',
    })
    .eq('id', co.id)
    .is('client_response', null)
    .select('id')

  if (updateError || !updatedRows || updatedRows.length === 0) {
    return { success: false, error: 'This change order has already been responded to' }
  }

  await supabase.from('estimate_activity').insert({
    project_id: co.project_id,
    company_id: co.company_id,
    estimate_id: co.estimate_id,
    event_type: 'change_order_declined',
    metadata: { change_order_id: co.id, number: co.number, total: co.total },
  })

  try {
    const { data: project } = await supabase
      .from('projects')
      .select('client:clients(name)')
      .eq('id', co.project_id)
      .maybeSingle()
    const rel = (project as { client: { name: string | null } | { name: string | null }[] | null } | null)?.client
    const clientName = (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? null

    await notifyChangeOrderResponse(
      {
        id: co.id,
        number: co.number,
        title: co.title,
        project_id: co.project_id,
        company_id: co.company_id,
        estimate_number: resolveEstimateNumber(parent),
        client_name: clientName,
      },
      'declined',
    )
  } catch (err) {
    console.warn('[declineChangeOrder] owner notification failed:', err)
  }

  return { success: true }
}
