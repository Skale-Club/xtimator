/**
 * Change order invoicing (XTM-CONTRACT-CO-01, delivery 3). Pure: shared by the
 * server action (the truth) and the owner's invoice dialog (preview only).
 *
 * The contract is the accepted estimate plus every approved change order, and
 * invoices are measured against it:
 *   - deposit: the estimate's deposit, unchanged.
 *   - balance: when a live deposit invoice exists, whatever remains of the
 *     contract (contract - already invoiced), so a deposit of any size followed
 *     by a balance can never leave a gap no invoice kind can bill. With no live
 *     deposit: estimate total - deposit + approved change orders that were NOT
 *     invoiced on their own. Credits (negative change orders) always land here.
 *   - full: the whole contract, only when nothing else was issued.
 *   - change_order: one approved, positive change order on its own, once.
 * Whatever is asked, the live invoices never add up to more than the contract.
 *
 * All amounts are integer minor units (cents).
 */

export type InvoiceKind = 'deposit' | 'balance' | 'full' | 'change_order'

export interface InvoicingApprovedChangeOrder {
  id: string
  number: number
  /** Signed amount (negative = credit), minor units. */
  totalCents: number
}

export interface InvoicingLiveInvoice {
  kind: InvoiceKind
  amount_cents: number
  change_order_id: string | null
}

export interface InvoicingInput {
  estimateTotalCents: number
  /** The deposit the deposit invoice charges (configured or percent split). */
  depositCents: number
  /** Approved change orders of the accepted current estimate (empty otherwise). */
  approvedChangeOrders: InvoicingApprovedChangeOrder[]
  /** Invoices that are not void / uncollectible. */
  liveInvoices: InvoicingLiveInvoice[]
}

export interface InvoicingSummary {
  estimateTotalCents: number
  /** Sum of every approved change order (credits included). */
  changeOrdersCents: number
  /** estimateTotalCents + changeOrdersCents. */
  contractCents: number
  /** Approved change orders that already have a live invoice of their own. */
  separatelyInvoicedIds: string[]
  /** Approved change orders the balance invoice carries (not invoiced alone). */
  changeOrdersInBalanceCents: number
  alreadyInvoicedCents: number
  /** contractCents - alreadyInvoicedCents (negative = invoiced beyond the contract). */
  remainingCents: number
}

export type InvoiceRequest =
  | { kind: 'deposit' | 'balance' | 'full' }
  | { kind: 'change_order'; changeOrderId: string }

export type InvoicePlan = { amountCents: number; error?: undefined } | { amountCents?: undefined; error: string }

export function summarizeInvoicing(input: InvoicingInput): InvoicingSummary {
  const approvedIds = new Set(input.approvedChangeOrders.map((co) => co.id))
  const separately = new Set(
    input.liveInvoices
      .filter((inv) => inv.kind === 'change_order' && inv.change_order_id && approvedIds.has(inv.change_order_id))
      .map((inv) => inv.change_order_id as string),
  )
  const changeOrdersCents = input.approvedChangeOrders.reduce((sum, co) => sum + co.totalCents, 0)
  const changeOrdersInBalanceCents = input.approvedChangeOrders
    .filter((co) => !separately.has(co.id))
    .reduce((sum, co) => sum + co.totalCents, 0)
  const contractCents = input.estimateTotalCents + changeOrdersCents
  const alreadyInvoicedCents = input.liveInvoices.reduce((sum, inv) => sum + (inv.amount_cents ?? 0), 0)
  return {
    estimateTotalCents: input.estimateTotalCents,
    changeOrdersCents,
    contractCents,
    separatelyInvoicedIds: [...separately],
    changeOrdersInBalanceCents,
    alreadyInvoicedCents,
    remainingCents: contractCents - alreadyInvoicedCents,
  }
}

/** True when a deposit invoice is live (not void / uncollectible). */
export function hasLiveDepositInvoice(input: Pick<InvoicingInput, 'liveInvoices'>): boolean {
  return input.liveInvoices.some((inv) => inv.kind === 'deposit')
}

/** Amount the requested invoice would charge, before the guards. */
export function invoiceAmountCents(input: InvoicingInput, request: InvoiceRequest): number {
  const s = summarizeInvoicing(input)
  switch (request.kind) {
    case 'full':
      return s.contractCents
    case 'deposit':
      return input.depositCents
    case 'balance':
      // A live deposit invoice means the balance bills what remains of the
      // contract, not a recomputation from a percentage (which could disagree
      // with the deposit actually issued and strand part of the contract).
      return hasLiveDepositInvoice(input)
        ? s.remainingCents
        : input.estimateTotalCents - input.depositCents + s.changeOrdersInBalanceCents
    case 'change_order': {
      const co = input.approvedChangeOrders.find((c) => c.id === request.changeOrderId)
      return co ? co.totalCents : 0
    }
  }
}

/**
 * The amount to charge, or the reason it cannot be issued. Error strings are
 * the user-facing English copy (translated by the caller's t()).
 */
export function planInvoice(
  input: InvoicingInput,
  request: InvoiceRequest,
  format: (cents: number) => string = (c) => (c / 100).toFixed(2),
): InvoicePlan {
  const s = summarizeInvoicing(input)

  if (request.kind === 'change_order') {
    const co = input.approvedChangeOrders.find((c) => c.id === request.changeOrderId)
    if (!co) return { error: 'Only an approved change order can be invoiced.' }
    if (co.totalCents <= 0) {
      return { error: "A credit can't be invoiced on its own. It lowers the balance invoice instead." }
    }
    if (input.liveInvoices.some((inv) => inv.kind === 'change_order' && inv.change_order_id === co.id)) {
      return { error: 'This change order already has an invoice. Void it before issuing another.' }
    }
  } else {
    if (request.kind === 'full' && input.liveInvoices.length > 0) {
      return {
        error:
          'This estimate already has an invoice issued. Void the existing invoice before issuing a new full invoice.',
      }
    }
    if (input.liveInvoices.some((inv) => inv.kind === request.kind)) {
      return {
        error: `A ${request.kind} invoice has already been issued for this estimate. Void it before issuing another.`,
      }
    }
  }

  const amountCents = invoiceAmountCents(input, request)
  if (amountCents <= 0) return { error: 'Nothing left to invoice.' }

  if (s.alreadyInvoicedCents + amountCents > s.contractCents) {
    if (request.kind === 'change_order' && input.liveInvoices.some((inv) => inv.kind === 'balance' || inv.kind === 'full')) {
      return {
        error:
          'This change order is already included in the balance invoice. Void the balance invoice to bill it on its own.',
      }
    }
    return {
      error: `This contract is already fully invoiced (${format(s.alreadyInvoicedCents)} of ${format(s.contractCents)} already invoiced).`,
    }
  }

  return { amountCents }
}
