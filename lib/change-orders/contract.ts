/**
 * Contract summary: accepted estimate (the contract) + its change orders.
 *
 * `buildContractSummary` is pure (rows in, ContractSummary out). The two loaders
 * read the rows with whatever Supabase client the caller already has:
 *  - loadOwnerContractSummary: a session client (RLS), drafts included;
 *  - loadPublicContractSummary: the service client, drafts excluded, null when
 *    there is nothing to show.
 * Both return null unless the estimate is the CURRENT, ACCEPTED version.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ChangeOrderInvoiceStatus,
  ChangeOrderResponse,
  ChangeOrderStatus,
  ContractChangeOrderRow,
  ContractSummary,
} from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

/** The estimate number the documents display: the override, else the sequence, else the version. */
export function resolveEstimateNumber(row: {
  estimate_number?: string | null
  estimate_seq?: number | null
  version?: number | null
}): string {
  const override = typeof row.estimate_number === 'string' ? row.estimate_number.trim() : ''
  if (override) return override
  if (typeof row.estimate_seq === 'number' && row.estimate_seq > 0) {
    return String(row.estimate_seq).padStart(4, '0')
  }
  return String(row.version ?? 1)
}

export interface ContractEstimateInput {
  estimateId: string
  currencyCode: string
  estimateNumber: string
  acceptedAt: string | null
  signedOnline: boolean
  /** Accepted amount: the signed total when signed online, else the live total. */
  baseTotal: number
}

export interface ContractChangeOrderInput {
  id: string
  number: number
  title: string
  status: ChangeOrderStatus
  client_response: ChangeOrderResponse | null
  total: number
  sent_at: string | null
  responded_at: string | null
  view_count: number
  /** Status of the change order's own live invoice, if any. */
  invoice_status?: ChangeOrderInvoiceStatus | null
}

export function buildContractSummary(
  estimate: ContractEstimateInput,
  changeOrders: ContractChangeOrderInput[],
  options: { includeDrafts: boolean },
): ContractSummary {
  const visible = changeOrders
    .filter((co) => options.includeDrafts || co.status !== 'draft')
    .sort((a, b) => a.number - b.number)

  let approved = 0
  let pending = 0
  const rows: ContractChangeOrderRow[] = visible.map((co) => {
    const total = Number(co.total) || 0
    if (co.client_response === 'accepted') approved += total
    else if (co.status === 'sent' && co.client_response == null) pending += total
    return {
      id: co.id,
      number: co.number,
      title: co.title,
      status: co.status,
      total,
      sent_at: co.sent_at,
      responded_at: co.responded_at,
      view_count: co.view_count ?? 0,
      invoice_status: co.invoice_status ?? null,
    }
  })

  const baseTotal = round2(Number(estimate.baseTotal) || 0)
  const approvedTotal = round2(approved)
  return {
    estimateId: estimate.estimateId,
    currencyCode: estimate.currencyCode,
    estimateNumber: estimate.estimateNumber,
    acceptedAt: estimate.acceptedAt,
    signedOnline: estimate.signedOnline,
    baseTotal,
    changeOrders: rows,
    approvedTotal,
    pendingTotal: round2(pending),
    contractTotal: round2(baseTotal + approvedTotal),
  }
}

interface ContractEstimateRow {
  id: string
  is_current: boolean | null
  client_response: string | null
  responded_at: string | null
  total: number | string | null
  currency_code: string | null
  estimate_number: string | null
  estimate_seq: number | null
  version: number | null
}

const CONTRACT_ESTIMATE_COLUMNS =
  'id, is_current, client_response, responded_at, total, currency_code, estimate_number, estimate_seq, version'

const CONTRACT_CO_COLUMNS =
  'id, number, title, status, client_response, total, sent_at, responded_at, view_count'

async function loadContract(
  supabase: SupabaseClient,
  estimateId: string,
  includeDrafts: boolean,
  scope?: { companyId?: string },
): Promise<ContractSummary | null> {
  let estimateQuery = supabase.from('estimates').select(CONTRACT_ESTIMATE_COLUMNS).eq('id', estimateId)
  if (scope?.companyId) estimateQuery = estimateQuery.eq('company_id', scope.companyId)
  const { data: estimateData, error: estimateError } = await estimateQuery.maybeSingle()
  if (estimateError) throw new Error('Could not load the contract estimate', { cause: estimateError })

  const estimate = estimateData as ContractEstimateRow | null
  if (!estimate || estimate.is_current !== true || estimate.client_response !== 'accepted') return null

  const [{ data: signatureData, error: signatureError }, { data: coData, error: coError }, { data: invoiceData }] = await Promise.all([
    supabase
      .from('estimate_signatures')
      .select('signed_total')
      .eq('estimate_id', estimateId)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('change_orders')
      .select(CONTRACT_CO_COLUMNS)
      .eq('estimate_id', estimateId)
      .order('number', { ascending: true }),
    supabase
      .from('invoices')
      .select('change_order_id, status')
      .eq('estimate_id', estimateId)
      .not('change_order_id', 'is', null)
      .in('status', ['open', 'paid']),
  ])
  if (signatureError) throw new Error('Could not load the contract signature', { cause: signatureError })
  if (coError) throw new Error('Could not load the contract change orders', { cause: coError })

  const invoiceStatusByCo = new Map<string, ChangeOrderInvoiceStatus>()
  for (const row of (invoiceData ?? []) as Array<{ change_order_id: string; status: string }>) {
    const prev = invoiceStatusByCo.get(row.change_order_id)
    if (prev !== 'paid') invoiceStatusByCo.set(row.change_order_id, row.status === 'paid' ? 'paid' : 'open')
  }

  const signature = signatureData as { signed_total: number | string | null } | null
  const signedTotal = signature?.signed_total != null ? Number(signature.signed_total) : null

  return buildContractSummary(
    {
      estimateId,
      currencyCode: estimate.currency_code ?? 'USD',
      estimateNumber: resolveEstimateNumber(estimate),
      acceptedAt: estimate.responded_at,
      signedOnline: signature != null,
      baseTotal: signedTotal ?? (Number(estimate.total) || 0),
    },
    ((coData ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      number: row.number as number,
      title: (row.title as string) ?? '',
      status: row.status as ChangeOrderStatus,
      client_response: (row.client_response as ChangeOrderResponse | null) ?? null,
      total: Number(row.total) || 0,
      sent_at: (row.sent_at as string | null) ?? null,
      responded_at: (row.responded_at as string | null) ?? null,
      view_count: Number(row.view_count) || 0,
      invoice_status: invoiceStatusByCo.get(row.id as string) ?? null,
    })),
    { includeDrafts },
  )
}

/** Owner view (session client): drafts included. null when the estimate is not the accepted current one. */
export async function loadOwnerContractSummary(
  supabase: SupabaseClient,
  estimateId: string,
  scope?: { companyId?: string },
): Promise<ContractSummary | null> {
  return loadContract(supabase, estimateId, true, scope)
}

/**
 * Public view (service client): drafts excluded. null when the estimate is not
 * the accepted current one, or when no change order is worth showing yet.
 */
export async function loadPublicContractSummary(
  supabase: SupabaseClient,
  estimateId: string,
  options: { allowEmpty?: boolean } = {},
): Promise<ContractSummary | null> {
  const summary = await loadContract(supabase, estimateId, false)
  if (!summary) return null
  if (summary.changeOrders.length === 0 && !options.allowEmpty) return null
  return summary
}
