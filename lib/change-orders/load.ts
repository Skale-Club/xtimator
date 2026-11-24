/**
 * Row loading + mapping shared by the owner actions (session client) and the
 * public/PDF queries (service client). Pure mapping lives in `mapChangeOrder`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SignedDocumentIdentity } from '@/lib/estimate/signing-identity'
import { hashChangeOrderSnapshot, type ChangeOrderEstimateReference, type ChangeOrderSnapshot } from './snapshot'
import type {
  ChangeOrder,
  ChangeOrderItem,
  ChangeOrderResponse,
  ChangeOrderSignature,
  ChangeOrderSigningContract,
  ChangeOrderStatus,
} from './types'

export type ChangeOrderRow = Record<string, unknown>

interface LoadedChangeOrder extends ChangeOrder {
  signedIdentity?: SignedDocumentIdentity
  signedEstimate?: ChangeOrderEstimateReference
}

function readSignedSnapshot(row: ChangeOrderRow, signature: ChangeOrderRow): ChangeOrderSnapshot {
  const snapshot = signature.signed_content as ChangeOrderSnapshot | undefined
  const hash = signature.snapshot_sha256
  if (
    !snapshot || (snapshot.version !== 1 && snapshot.version !== 2) ||
    snapshot.change_order_id !== row.id || snapshot.estimate_id !== row.estimate_id ||
    !Array.isArray(snapshot.items) || Number(signature.signed_total) !== snapshot.total ||
    (snapshot.version === 2 && (!hash || !snapshot.contract || !snapshot.identity)) ||
    (typeof hash === 'string' && hashChangeOrderSnapshot(snapshot) !== hash.toLowerCase())
  ) {
    throw new Error('The change order signature does not match its signed document')
  }
  return snapshot
}

export function mapChangeOrder(
  row: ChangeOrderRow,
  itemRows: ChangeOrderRow[],
  signatureRow: ChangeOrderRow | null,
): LoadedChangeOrder {
  const snapshot = signatureRow ? readSignedSnapshot(row, signatureRow) : null
  const items: ChangeOrderItem[] = snapshot?.items ?? [...itemRows]
    .map((it) => ({
      id: it.id as string,
      description: (it.description as string) ?? '',
      quantity: Number(it.quantity) || 0,
      unit: (it.unit as string | null) ?? null,
      unit_price: Number(it.unit_price) || 0,
      total: Number(it.total) || 0,
      taxable: it.taxable !== false,
      sort_order: Number(it.sort_order) || 0,
    }))
    .sort((a, b) => a.sort_order - b.sort_order)

  const signature: ChangeOrderSignature | null = signatureRow
    ? {
        signer_name: signatureRow.signer_name as string,
        signed_at: signatureRow.signed_at as string,
        signature_data: signatureRow.signature_data as string,
      }
    : null

  return {
    id: row.id as string,
    company_id: row.company_id as string,
    project_id: row.project_id as string,
    estimate_id: row.estimate_id as string,
    number: snapshot?.number ?? Number(row.number),
    title: snapshot?.title ?? (row.title as string) ?? '',
    reason: snapshot ? snapshot.reason : (row.reason as string | null) ?? null,
    extra_days: snapshot ? snapshot.extra_days : row.extra_days == null ? null : Number(row.extra_days),
    status: signature ? 'accepted' : row.status as ChangeOrderStatus,
    share_token: row.share_token as string,
    sent_at: (row.sent_at as string | null) ?? null,
    viewed_at: (row.viewed_at as string | null) ?? null,
    view_count: Number(row.view_count) || 0,
    responded_at: signature?.signed_at ?? (row.responded_at as string | null) ?? null,
    client_response: signature ? 'accepted' : (row.client_response as ChangeOrderResponse | null) ?? null,
    tax_rate: snapshot?.tax_rate ?? (Number(row.tax_rate) || 0),
    subtotal: snapshot?.subtotal ?? (Number(row.subtotal) || 0),
    tax_amount: snapshot?.tax_amount ?? (Number(row.tax_amount) || 0),
    total: snapshot?.total ?? (Number(row.total) || 0),
    currency_code: snapshot?.currency_code ?? (row.currency_code as string) ?? 'USD',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    items,
    hasSignature: signature != null,
    signature,
    signedContract: snapshot?.contract ?? null,
    ...(snapshot?.identity ? { signedIdentity: snapshot.identity } : {}),
    ...(snapshot?.estimate ? { signedEstimate: snapshot.estimate } : {}),
  }
}

/** Loads one change order (items + signature) by id or share token. null when absent. */
export async function loadChangeOrder(
  supabase: SupabaseClient,
  by: { id: string } | { token: string },
  scope?: { companyId?: string },
): Promise<LoadedChangeOrder | null> {
  let query = supabase.from('change_orders').select('*')
  query = 'id' in by ? query.eq('id', by.id) : query.eq('share_token', by.token)
  if (scope?.companyId) query = query.eq('company_id', scope.companyId)
  const { data: row, error: rowError } = await query.maybeSingle()
  if (rowError) throw new Error('Could not load the change order', { cause: rowError })
  if (!row) return null
  const co = row as ChangeOrderRow

  const { data: signatureRow, error: signatureError } = await supabase
    .from('change_order_signatures')
    .select('signer_name, signed_at, signature_data, signed_content, signed_total, snapshot_sha256')
    .eq('change_order_id', co.id as string)
    .maybeSingle()
  if (signatureError) throw new Error('Could not load the change order signature', { cause: signatureError })
  if (signatureRow) return mapChangeOrder(co, [], signatureRow)

  const { data: itemRows, error: itemsError } = await supabase
    .from('change_order_items')
    .select('*')
    .eq('change_order_id', co.id as string)
    .order('sort_order', { ascending: true })
  if (itemsError) throw new Error('Could not load the change order items', { cause: itemsError })
  return mapChangeOrder(co, itemRows ?? [], null)
}

export async function loadChangeOrderSigningContract(
  supabase: SupabaseClient,
  changeOrderId: string,
): Promise<ChangeOrderSigningContract> {
  const { data, error } = await supabase.rpc('get_change_order_signing_contract', { p_change_order_id: changeOrderId })
  if (error) throw error
  if (!data || !Number.isFinite(data.before) || !Number.isFinite(data.after) || typeof data.revision !== 'string' || !data.revision) {
    throw new Error('Could not load the contract for change order signing')
  }
  return { before: data.before, after: data.after, revision: data.revision }
}
