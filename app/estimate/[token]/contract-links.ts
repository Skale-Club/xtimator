import 'server-only'
import { getPublicContractSummary } from '@/lib/change-orders/queries'
import { changeOrderPublicPath, type ContractSummary } from '@/lib/change-orders/types'
import { requireServiceClient } from '@/lib/supabase/service'

export interface PublicContractProps {
  contract: ContractSummary | null
  /** change order id -> /change-order/<token> */
  contractLinks: Record<string, string>
}

const NONE: PublicContractProps = { contract: null, contractLinks: {} }

/**
 * Contract block for the public estimate pages. Only an ACCEPTED estimate has a
 * contract, so nothing is fetched otherwise. The summary rows carry no share
 * token (types.ts is a fixed contract), so the tokens come from one extra
 * service-client read keyed by the ids the summary already authorized. Never
 * throws: a failure just hides the block, the estimate itself still renders.
 */
export async function loadPublicContract(
  estimateId: string,
  clientResponse: string | null | undefined
): Promise<PublicContractProps> {
  if (clientResponse !== 'accepted') return NONE
  try {
    const contract = await getPublicContractSummary(estimateId)
    const rows = contract?.changeOrders.filter((row) => row.status !== 'draft') ?? []
    if (!contract || rows.length === 0) return NONE

    const ids = rows.map((row) => row.id)
    const { data } = await requireServiceClient()
      .from('change_orders')
      .select('id, share_token')
      .in('id', ids)
    const contractLinks: Record<string, string> = {}
    for (const row of (data ?? []) as Array<{ id: string; share_token: string | null }>) {
      if (row.share_token) contractLinks[row.id] = changeOrderPublicPath(row.share_token)
    }
    return { contract: { ...contract, changeOrders: rows }, contractLinks }
  } catch {
    return NONE
  }
}
