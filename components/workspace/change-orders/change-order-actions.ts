import {
  createChangeOrder,
  deleteChangeOrder,
  getContractSummaryAction,
  markChangeOrderShared,
  recordChangeOrderResponse,
  saveChangeOrder,
} from '@/lib/actions/change-order'

/**
 * What the change order UI calls on the server. Components take this as an
 * optional prop (default: the real server actions) so tests and the /dev
 * fixture can inject fakes without touching the network.
 */
export interface ChangeOrderActions {
  createChangeOrder: typeof createChangeOrder
  getContractSummary: typeof getContractSummaryAction
  saveChangeOrder: typeof saveChangeOrder
  deleteChangeOrder: typeof deleteChangeOrder
  markChangeOrderShared: typeof markChangeOrderShared
  recordChangeOrderResponse: typeof recordChangeOrderResponse
}

export const realChangeOrderActions: ChangeOrderActions = {
  createChangeOrder,
  getContractSummary: getContractSummaryAction,
  saveChangeOrder,
  deleteChangeOrder,
  markChangeOrderShared,
  recordChangeOrderResponse,
}

export function changeOrderHref(projectId: string, changeOrderId: string): string {
  return `/projects/${projectId}/change-orders/${changeOrderId}`
}
