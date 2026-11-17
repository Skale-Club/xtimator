/**
 * Row loading + mapping shared by the owner actions (session client) and the
 * public/PDF queries (service client). Pure mapping lives in `mapChangeOrder`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ChangeOrder,
  ChangeOrderItem,
  ChangeOrderResponse,
  ChangeOrderSignature,
  ChangeOrderStatus,
} from './types'

export type ChangeOrderRow = Record<string, unknown>

export function mapChangeOrder(
  row: ChangeOrderRow,
  itemRows: ChangeOrderRow[],
  signatureRow: ChangeOrderRow | null,
): ChangeOrder {
  const items: ChangeOrderItem[] = [...itemRows]
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
    number: Number(row.number),
    title: (row.title as string) ?? '',
    reason: (row.reason as string | null) ?? null,
    extra_days: row.extra_days == null ? null : Number(row.extra_days),
    status: row.status as ChangeOrderStatus,
    share_token: row.share_token as string,
    sent_at: (row.sent_at as string | null) ?? null,
    viewed_at: (row.viewed_at as string | null) ?? null,
    view_count: Number(row.view_count) || 0,
    responded_at: (row.responded_at as string | null) ?? null,
    client_response: (row.client_response as ChangeOrderResponse | null) ?? null,
    tax_rate: Number(row.tax_rate) || 0,
    subtotal: Number(row.subtotal) || 0,
    tax_amount: Number(row.tax_amount) || 0,
    total: Number(row.total) || 0,
    currency_code: (row.currency_code as string) ?? 'USD',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    items,
    hasSignature: signature != null,
    signature,
  }
}

/** Loads one change order (items + signature) by id or share token. null when absent. */
export async function loadChangeOrder(
  supabase: SupabaseClient,
  by: { id: string } | { token: string },
  scope?: { companyId?: string },
): Promise<ChangeOrder | null> {
  let query = supabase.from('change_orders').select('*')
  query = 'id' in by ? query.eq('id', by.id) : query.eq('share_token', by.token)
  if (scope?.companyId) query = query.eq('company_id', scope.companyId)
  const { data: row } = await query.maybeSingle()
  if (!row) return null
  const co = row as ChangeOrderRow

  const [{ data: itemRows }, { data: signatureRow }] = await Promise.all([
    supabase
      .from('change_order_items')
      .select('*')
      .eq('change_order_id', co.id as string)
      .order('sort_order', { ascending: true }),
    supabase
      .from('change_order_signatures')
      .select('signer_name, signed_at, signature_data')
      .eq('change_order_id', co.id as string)
      .limit(1)
      .maybeSingle(),
  ])

  return mapChangeOrder(
    co,
    (itemRows ?? []) as ChangeOrderRow[],
    (signatureRow as ChangeOrderRow | null) ?? null,
  )
}
