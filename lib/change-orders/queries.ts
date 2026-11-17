/**
 * Read paths for change orders that run on the server outside server actions
 * (server components, route handlers). CONTRACT STUBS: signatures are final
 * (see lib/change-orders/types.ts); bodies are implemented by the
 * database/server work package.
 */
import type { ContractSummary, PublicChangeOrderData } from './types'

/**
 * Client page data by share token (service client: the client is anonymous).
 * Bumps nothing. Returns null for an unknown token or a change order whose
 * parent estimate is gone.
 */
export async function getChangeOrderByShareToken(token: string): Promise<PublicChangeOrderData | null> {
  void token
  return null
}

/**
 * Contract summary for the accepted estimate's PUBLIC page (service client,
 * drafts excluded). null when the estimate is not accepted or has no change
 * orders worth showing.
 */
export async function getPublicContractSummary(estimateId: string): Promise<ContractSummary | null> {
  void estimateId
  return null
}

/**
 * Records one client view of the change order page (view_count + viewed_at)
 * without restamping updated_at. Fire-and-forget; never throws.
 */
export async function recordChangeOrderView(token: string): Promise<void> {
  void token
}
