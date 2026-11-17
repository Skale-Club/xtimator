'use server'

/**
 * Owner-side server actions for change orders. CONTRACT STUBS: the signatures
 * below are final (see lib/change-orders/types.ts); the bodies are implemented
 * by the database/server work package. UI code calls only these.
 */
import type {
  ActionResult,
  ChangeOrder,
  ChangeOrderResponse,
  ContractSummary,
  SaveChangeOrderInput,
} from '@/lib/change-orders/types'

const NOT_IMPLEMENTED = 'not_implemented'

/** Creates the next draft change order on an accepted, current estimate. */
export async function createChangeOrder(estimateId: string): Promise<ActionResult<{ id: string; number: number }>> {
  void estimateId
  return { error: NOT_IMPLEMENTED }
}

/** Loads one change order (with items and signature) for the owner. */
export async function getChangeOrderAction(id: string): Promise<ActionResult<ChangeOrder>> {
  void id
  return { error: NOT_IMPLEMENTED }
}

/**
 * Saves header + items (items replaced as a whole) with compare-and-set on
 * expectedUpdatedAt. Errors: 'change_order_locked' (answered or signed),
 * conflict:true when another save landed first.
 */
export async function saveChangeOrder(
  input: SaveChangeOrderInput,
): Promise<ActionResult<{ updated_at: string; subtotal: number; tax_amount: number; total: number }>> {
  void input
  return { error: NOT_IMPLEMENTED }
}

/** Deletes a change order that was never shared, answered or signed. */
export async function deleteChangeOrder(id: string): Promise<ActionResult<{ id: string }>> {
  void id
  return { error: NOT_IMPLEMENTED }
}

/** First share (copy link / open / message): sets sent_at once and status 'sent'. Idempotent. */
export async function markChangeOrderShared(id: string): Promise<ActionResult<{ sent_at: string }>> {
  void id
  return { error: NOT_IMPLEMENTED }
}

/**
 * Owner records (or clears, with null) the client's answer, for companies
 * without online approval or after a phone call. Refused when signed online.
 * Clearing a 'declined' answer is "Revise and reopen".
 */
export async function recordChangeOrderResponse(
  id: string,
  response: ChangeOrderResponse | null,
): Promise<ActionResult<{ client_response: ChangeOrderResponse | null; responded_at: string | null; updated_at: string }>> {
  void id
  void response
  return { error: NOT_IMPLEMENTED }
}

/** Contract summary for the owner (drafts included). null when the estimate is not accepted. */
export async function getContractSummaryAction(estimateId: string): Promise<ActionResult<ContractSummary | null>> {
  void estimateId
  return { error: NOT_IMPLEMENTED }
}
