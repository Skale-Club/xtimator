'use server'

/**
 * Owner-side server actions for change orders ("aditivos"). The signatures are
 * the contract in lib/change-orders/types.ts; UI code calls only these.
 *
 * Guards, in the same order the estimate actions use: authenticated -> demo
 * (assertWritable, then assertCompanyWritable for the active company) ->
 * billing (a paywalled company is read-only). Reads are RLS-scoped to the
 * caller's membership AND explicitly scoped to the active company.
 *
 * The write set of a save is ONE atomic RPC (save_change_order_atomic); the
 * create goes through create_change_order. SQLSTATE mapping (matched on
 * error.code, never the message): P0010 signed-undeletable, P0011 locked,
 * P0012 conflict, P0013 not found, P0014 contract not accepted, P0016 estimate
 * not found. See supabase/migrations/20261117000001_change_orders.sql.
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { billingEditDenied } from '@/lib/billing/access-guard'
import { assertCompanyWritable, assertWritable } from '@/lib/demo/guard'
import { loadChangeOrder } from '@/lib/change-orders/load'
import { loadOwnerContractSummary } from '@/lib/change-orders/contract'
import type {
  ActionResult,
  ChangeOrder,
  ChangeOrderResponse,
  ContractSummary,
  SaveChangeOrderInput,
} from '@/lib/change-orders/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type OwnerContext = { supabase: SupabaseServerClient; companyId: string }

const SIGNED_DELETE_SQLSTATE = 'P0010'
const LOCKED_SQLSTATE = 'P0011'
const CONFLICT_SQLSTATE = 'P0012'
const NOT_FOUND_SQLSTATE = 'P0013'
const CONTRACT_NOT_ACCEPTED_SQLSTATE = 'P0014'
const ESTIMATE_NOT_FOUND_SQLSTATE = 'P0016'

/** Authenticated caller + active company. Read paths use this alone. */
async function readContext(): Promise<{ error: string } | OwnerContext> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return { error: 'Not authenticated' }

  const companyId = await getActiveCompanyId()
  if (!companyId) return { error: 'No company found' }

  return { supabase, companyId }
}

/** readContext + the demo and billing guards every WRITE passes through. */
async function writeContext(): Promise<{ error: string } | OwnerContext> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return { error: 'Not authenticated' }

  const denied = await assertWritable()
  if (denied) return { error: denied.error }

  const companyId = await getActiveCompanyId()
  if (!companyId) return { error: 'No company found' }

  const companyDenied = await assertCompanyWritable(companyId)
  if (companyDenied) return { error: companyDenied.error }
  const billingDenied = await billingEditDenied(companyId)
  if (billingDenied) return { error: billingDenied.error }

  return { supabase, companyId }
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200
}

async function logActivity(
  supabase: SupabaseServerClient,
  row: {
    project_id: string
    company_id: string
    estimate_id: string
    event_type: string
    metadata: Record<string, unknown>
  },
): Promise<void> {
  try {
    const { error } = await supabase.from('estimate_activity').insert(row)
    if (error) console.error('[change-orders] activity insert failed', error)
  } catch (err) {
    console.error('[change-orders] activity insert threw', err)
  }
}

/** Creates the next draft change order on an accepted, current estimate. */
export async function createChangeOrder(estimateId: string): Promise<ActionResult<{ id: string; number: number }>> {
  if (!isId(estimateId)) return { error: 'Invalid estimate id' }

  const ctx = await writeContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, companyId } = ctx

  // Explicit tenant scope on top of RLS: the estimate must belong to the active company.
  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, project_id')
    .eq('id', estimateId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!estimate) return { error: 'Estimate not found' }

  const { data: rpcData, error: rpcError } = await supabase.rpc('create_change_order', {
    p_estimate_id: estimateId,
  })

  if (rpcError) {
    if (rpcError.code === CONTRACT_NOT_ACCEPTED_SQLSTATE) return { error: 'contract_not_accepted' }
    if (rpcError.code === ESTIMATE_NOT_FOUND_SQLSTATE) return { error: 'Estimate not found' }
    return { error: 'Failed to create change order' }
  }

  const result = rpcData as { id: string; number: number }
  const projectId = (estimate as { project_id: string }).project_id

  await logActivity(supabase, {
    project_id: projectId,
    company_id: companyId,
    estimate_id: estimateId,
    event_type: 'change_order_created',
    metadata: { change_order_id: result.id, number: result.number },
  })

  revalidatePath(`/projects/${projectId}`)
  return { data: { id: result.id, number: result.number } }
}

/** Loads one change order (with items and signature) for the owner. */
export async function getChangeOrderAction(id: string): Promise<ActionResult<ChangeOrder>> {
  if (!isId(id)) return { error: 'Invalid change order id' }

  const ctx = await readContext()
  if ('error' in ctx) return { error: ctx.error }

  const changeOrder = await loadChangeOrder(ctx.supabase, { id }, { companyId: ctx.companyId })
  if (!changeOrder) return { error: 'Change order not found' }
  return { data: changeOrder }
}

// Shape + bounds only (this is a 'use server' endpoint reachable directly).
// The totals are recomputed inside the RPC, never trusted from the client.
const MAX_ITEMS = 200
const saveChangeOrderSchema = z.object({
  id: z.string().min(1).max(200),
  expectedUpdatedAt: z.string().min(1).max(64).optional(),
  title: z.string().max(200),
  reason: z.string().max(10_000).nullable(),
  extra_days: z.number().int().min(0).max(3650).nullable(),
  items: z
    .array(
      z.object({
        id: z.string().max(200).optional(),
        description: z.string().max(1000),
        quantity: z.number().min(0).max(9_999_999),
        unit: z.string().max(50).nullable(),
        unit_price: z.number().min(-99_999_999).max(99_999_999),
        taxable: z.boolean(),
        sort_order: z.number().int().min(0).max(100_000),
      }),
    )
    .max(MAX_ITEMS),
})

/**
 * Saves header + items (items replaced as a whole) with compare-and-set on
 * expectedUpdatedAt. Errors: 'change_order_locked' (answered or signed),
 * conflict:true when another save landed first.
 */
export async function saveChangeOrder(
  input: SaveChangeOrderInput,
): Promise<ActionResult<{ updated_at: string; subtotal: number; tax_amount: number; total: number }>> {
  const parsed = saveChangeOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { error: `Invalid change order data: ${parsed.error.issues[0]?.message ?? 'validation failed'}` }
  }
  const data = parsed.data

  const ctx = await writeContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, companyId } = ctx

  const { data: rpcData, error: rpcError } = await supabase.rpc('save_change_order_atomic', {
    p_change_order_id: data.id,
    p_company_id: companyId,
    p_expected_updated_at: data.expectedUpdatedAt ?? null,
    p_header: {
      title: data.title,
      reason: data.reason,
      extra_days: data.extra_days,
    },
    p_items: data.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      taxable: item.taxable,
      sort_order: item.sort_order,
    })),
  })

  if (rpcError) {
    if (rpcError.code === LOCKED_SQLSTATE) return { error: 'change_order_locked' }
    if (rpcError.code === CONFLICT_SQLSTATE) {
      return {
        error:
          'This change order was changed elsewhere since you last loaded it. Your unsaved changes were NOT applied. Reload to see the latest version before continuing.',
        conflict: true,
      }
    }
    if (rpcError.code === NOT_FOUND_SQLSTATE) return { error: 'Change order not found' }
    return { error: 'Failed to save change order' }
  }

  const result = rpcData as { updated_at: string; subtotal: number; tax_amount: number; total: number }
  return {
    data: {
      updated_at: result.updated_at,
      subtotal: Number(result.subtotal),
      tax_amount: Number(result.tax_amount),
      total: Number(result.total),
    },
  }
}

/** Deletes a change order that was never shared, answered or signed. */
export async function deleteChangeOrder(id: string): Promise<ActionResult<{ id: string }>> {
  if (!isId(id)) return { error: 'Invalid change order id' }

  const ctx = await writeContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, companyId } = ctx

  const { data: row } = await supabase
    .from('change_orders')
    .select('id, project_id, sent_at, client_response')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!row) return { error: 'Change order not found' }
  const co = row as { id: string; project_id: string; sent_at: string | null; client_response: string | null }

  if (co.sent_at || co.client_response) return { error: 'change_order_not_deletable' }

  const { data: signature } = await supabase
    .from('change_order_signatures')
    .select('id')
    .eq('change_order_id', id)
    .limit(1)
    .maybeSingle()
  if (signature) return { error: 'change_order_not_deletable' }

  // The WHERE re-states the "never shared or answered" rule, so a share or an
  // answer landing after the read above makes this a no-op instead of a delete.
  const { data: deleted, error: deleteError } = await supabase
    .from('change_orders')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)
    .is('sent_at', null)
    .is('client_response', null)
    .select('id')

  if (deleteError) {
    if (deleteError.code === SIGNED_DELETE_SQLSTATE) return { error: 'change_order_not_deletable' }
    return { error: 'Failed to delete change order' }
  }
  if (!deleted || deleted.length === 0) return { error: 'change_order_not_deletable' }

  revalidatePath(`/projects/${co.project_id}`)
  return { data: { id } }
}

/**
 * First share (copy link / open / message): sets sent_at once and status 'sent'. Idempotent.
 *
 * updated_at: the UPDATE below changes sent_at/status, so the BEFORE UPDATE
 * trigger restamps updated_at. That is deliberate and safe ONLY because it
 * happens on the FIRST share, before the client can have opened the link and
 * obtained a content version. Every later call finds sent_at already set and
 * returns it WITHOUT writing, so a client's open page version never moves.
 */
export async function markChangeOrderShared(id: string): Promise<ActionResult<{ sent_at: string }>> {
  if (!isId(id)) return { error: 'Invalid change order id' }

  const ctx = await writeContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, companyId } = ctx

  const { data: row } = await supabase
    .from('change_orders')
    .select('id, project_id, estimate_id, number, status, sent_at')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!row) return { error: 'Change order not found' }
  const co = row as {
    id: string
    project_id: string
    estimate_id: string
    number: number
    status: string
    sent_at: string | null
  }

  if (co.sent_at) return { data: { sent_at: co.sent_at } }

  const sentAt = new Date().toISOString()
  const patch: Record<string, unknown> = { sent_at: sentAt }
  if (co.status === 'draft') patch.status = 'sent'

  const { data: updated, error: updateError } = await supabase
    .from('change_orders')
    .update(patch)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('sent_at', null)
    .select('id, sent_at')

  if (updateError) return { error: 'Failed to mark change order as shared' }

  if (!updated || updated.length === 0) {
    // A concurrent first share won the race: report its timestamp.
    const { data: current } = await supabase
      .from('change_orders')
      .select('sent_at')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()
    const existing = (current as { sent_at: string | null } | null)?.sent_at
    return existing ? { data: { sent_at: existing } } : { error: 'Failed to mark change order as shared' }
  }

  await logActivity(supabase, {
    project_id: co.project_id,
    company_id: companyId,
    estimate_id: co.estimate_id,
    event_type: 'change_order_sent',
    metadata: { change_order_id: co.id, number: co.number },
  })

  revalidatePath(`/projects/${co.project_id}`)
  return { data: { sent_at: (updated[0] as { sent_at: string }).sent_at ?? sentAt } }
}

/**
 * Owner records (or clears, with null) the client's answer, for companies
 * without online approval or after a phone call. Refused when signed online.
 * Clearing a 'declined' answer is "Revise and reopen".
 *
 * Writes the same columns the public path writes (client_response,
 * responded_at, status) and keeps projects.total on the contract total
 * (accepted estimate + approved change orders). updated_at is restamped by the
 * trigger; the new value is returned so the editor can re-baseline.
 */
export async function recordChangeOrderResponse(
  id: string,
  response: ChangeOrderResponse | null,
): Promise<ActionResult<{ client_response: ChangeOrderResponse | null; responded_at: string | null; updated_at: string }>> {
  if (!isId(id)) return { error: 'Invalid change order id' }
  if (response !== null && response !== 'accepted' && response !== 'declined') {
    return { error: 'Invalid response' }
  }

  const ctx = await writeContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, companyId } = ctx

  const { data: row } = await supabase
    .from('change_orders')
    .select('id, project_id, estimate_id, number, total, status, sent_at, client_response, responded_at, updated_at')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!row) return { error: 'Change order not found' }
  const co = row as {
    id: string
    project_id: string
    estimate_id: string
    number: number
    total: number
    status: string
    sent_at: string | null
    client_response: ChangeOrderResponse | null
    responded_at: string | null
    updated_at: string
  }

  const { data: result, error: updateError } = await supabase.rpc('record_change_order_response_atomic', {
    p_change_order_id: id,
    p_company_id: companyId,
    p_expected_updated_at: co.updated_at,
    p_response: response,
  })
  if (updateError || !result) {
    const code = updateError?.code
    if (code === 'P0011') return { error: 'This change order was signed online and cannot be changed' }
    if (code === 'P0014') return { error: 'contract_not_accepted' }
    if (code === 'P0012') return { error: 'This change order changed. Reload before recording a response.', conflict: true }
    return { error: 'Failed to record the response' }
  }
  const committed = result as { client_response: ChangeOrderResponse | null; responded_at: string | null; updated_at: string }

  revalidatePath(`/projects/${co.project_id}`)
  revalidatePath('/dashboard')

  return {
    data: { client_response: committed.client_response, responded_at: committed.responded_at, updated_at: committed.updated_at },
  }
}

/** Contract summary for the owner (drafts included). null when the estimate is not accepted. */
export async function getContractSummaryAction(estimateId: string): Promise<ActionResult<ContractSummary | null>> {
  if (!isId(estimateId)) return { error: 'Invalid estimate id' }

  const ctx = await readContext()
  if ('error' in ctx) return { error: ctx.error }

  const summary = await loadOwnerContractSummary(ctx.supabase, estimateId, { companyId: ctx.companyId })
  return { data: summary }
}
