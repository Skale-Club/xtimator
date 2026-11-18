/**
 * Change orders ("aditivos"): small signed documents attached to an ACCEPTED
 * estimate. The accepted estimate is the contract and never changes; every
 * later change to the work is a change order the client approves and signs on
 * its own. Contract total = accepted estimate + approved change orders.
 *
 * Decision XTM-CONTRACT-CO-01 (delivery 2). This file is the shared contract
 * between the database/server layer (lib/change-orders/*, lib/actions/
 * change-order.ts), the owner editor (components/workspace/change-orders/*) and
 * the client page + PDF (app/change-order/*, components/share/change-order-view,
 * components/pdf/change-order-pdf). Change it only on purpose.
 *
 * Rules:
 * - Only the CURRENT version of an estimate that is accepted (client_response =
 *   'accepted', signed online or recorded by the owner) can get change orders.
 * - Numbers run 1, 2, 3... per estimate. Display: "Change order #2", document
 *   number `${estimateNumber}-CO2` (see formatChangeOrderNumber).
 * - Lines are added work (positive unit_price) or credits (negative unit_price).
 *   Tax uses the parent estimate's tax rate, copied onto the change order when it
 *   is created, applied to taxable lines. No discount, no deposit.
 * - Same lock rule as estimates: editable until the client answers (accepted or
 *   declined) or signs. Sharing does not lock. A declined change order can be
 *   reopened by the owner (answer cleared, history kept).
 * - Signing proves the version: the client page sends the change order's
 *   updated_at as contentVersion; a mismatch is refused (409 change_order_updated).
 * - Approved change orders count in the contract total; sent / draft / declined
 *   ones do not.
 */

export type ChangeOrderStatus = 'draft' | 'sent' | 'accepted' | 'declined'

export type ChangeOrderResponse = 'accepted' | 'declined'

export interface ChangeOrderItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  /** Negative for a credit line. */
  unit_price: number
  /** quantity * unit_price, rounded to cents (negative for credits). */
  total: number
  taxable: boolean
  sort_order: number
}

export interface ChangeOrderSignature {
  signer_name: string
  signed_at: string
  /** data:image/png;base64,... */
  signature_data: string
}

export interface ChangeOrder {
  id: string
  company_id: string
  project_id: string
  /** The accepted estimate this change order amends. */
  estimate_id: string
  /** 1, 2, 3... per estimate. */
  number: number
  /** Short name, e.g. "Garage painting". Empty string allowed while drafting. */
  title: string
  /** Why the change was made. */
  reason: string | null
  /** Extra working days the change adds (null = not stated). */
  extra_days: number | null
  status: ChangeOrderStatus
  share_token: string
  sent_at: string | null
  viewed_at: string | null
  view_count: number
  responded_at: string | null
  client_response: ChangeOrderResponse | null
  /** Copied from the parent estimate at creation. A FRACTION, like estimates.tax_rate (0.0625 = 6.25%). */
  tax_rate: number
  subtotal: number
  tax_amount: number
  /** Signed amount this change order adds to the contract (negative = credit). */
  total: number
  currency_code: string
  created_at: string
  /** Concurrency token: saves compare-and-set on it, signing checks it. */
  updated_at: string
  items: ChangeOrderItem[]
  hasSignature: boolean
  signature: ChangeOrderSignature | null
}

/** One row of the contract card / client page list. */
export interface ContractChangeOrderRow {
  id: string
  number: number
  title: string
  status: ChangeOrderStatus
  total: number
  sent_at: string | null
  responded_at: string | null
  view_count: number
  /** Live invoice of its own (kind change_order): null when not billed alone. */
  invoice_status: ChangeOrderInvoiceStatus | null
}

/** A change order's own invoice, as the owner editor and client page see it. */
export type ChangeOrderInvoiceStatus = 'open' | 'paid'

export interface ChangeOrderInvoice {
  id: string
  status: ChangeOrderInvoiceStatus
  amount_cents: number
  currency_code: string
  /** Stripe hosted payment page; null until Stripe returns it. */
  hosted_invoice_url: string | null
  paid_at: string | null
}

export interface ContractSummary {
  estimateId: string
  currencyCode: string
  /** Formatted estimate number, e.g. "SK-1045". */
  estimateNumber: string
  /** When the estimate was accepted (responded_at). */
  acceptedAt: string | null
  /** True when accepted through an online signature. */
  signedOnline: boolean
  /** Accepted estimate amount: the signed total when signed, else the live total. */
  baseTotal: number
  /** Ordered by number. Owner views get drafts too; public views never do. */
  changeOrders: ContractChangeOrderRow[]
  /** Sum of accepted change orders. */
  approvedTotal: number
  /** Sum of sent, unanswered change orders (not in the contract yet). */
  pendingTotal: number
  /** baseTotal + approvedTotal. */
  contractTotal: number
}

/** What the client page needs, loaded with the service client by share token. */
export interface PublicChangeOrderData {
  changeOrder: ChangeOrder
  company: {
    id: string
    name: string
    logo_url: string | null
    phone: string | null
    email: string | null
    brand_primary_color: string | null
    /** Online approval: when false the page shows no approve/decline UI. */
    digital_signature_enabled: boolean
  }
  estimate: {
    id: string
    estimateNumber: string
    projectName: string
    clientName: string | null
    acceptedAt: string | null
    /** Public link of the accepted estimate, for "See the accepted estimate". */
    publicPath: string
    language: string
  }
  /** Public view: drafts excluded. */
  contract: ContractSummary
  /** This change order's own live invoice (open or paid), else null. */
  invoice: ChangeOrderInvoice | null
}

/** Payload of the owner's save. Items are replaced as a whole. */
export interface SaveChangeOrderInput {
  id: string
  /** The updated_at the editor last loaded; omit only for "keep my changes". */
  expectedUpdatedAt?: string
  title: string
  reason: string | null
  extra_days: number | null
  items: Array<{
    id?: string
    description: string
    quantity: number
    unit: string | null
    unit_price: number
    taxable: boolean
    sort_order: number
  }>
}

export type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string; conflict?: boolean }

/** "6.25%" from a fractional rate (0.0625). Trailing zeros dropped. */
export function formatTaxRatePercent(rate: number): string {
  const pct = Math.round((Number(rate) || 0) * 1_000_000) / 10_000
  return `${pct}%`
}

/** "SK-1045-CO2". */
export function formatChangeOrderNumber(estimateNumber: string, number: number): string {
  return `${estimateNumber}-CO${number}`
}

/** Totals exactly as the server computes them (cents rounding per line). */
export function computeChangeOrderTotals(
  items: Array<{ quantity: number; unit_price: number; taxable: boolean }>,
  taxRate: number,
): { subtotal: number; tax_amount: number; total: number } {
  const round = (n: number) => Math.round(n * 100) / 100
  let subtotal = 0
  let taxable = 0
  for (const it of items) {
    const line = round((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))
    subtotal += line
    if (it.taxable) taxable += line
  }
  subtotal = round(subtotal)
  // taxRate is a fraction (0.0625 = 6.25%), the same unit as estimates.tax_rate.
  const tax_amount = round(taxable * (Number(taxRate) || 0))
  return { subtotal, tax_amount, total: round(subtotal + tax_amount) }
}

/** Public URL path of a change order. */
export function changeOrderPublicPath(shareToken: string): string {
  return `/change-order/${shareToken}`
}
