import type { BillingOperation } from '@/lib/billing/operations'

const operations = new Map<string, BillingOperation>()
const leases = new Set<string>()

export function resetBillingOperationFixtures() {
  operations.clear()
  leases.clear()
}

/** Isolated reservation boundary; payment orchestration itself remains real. */
export function memoryBillingOperationBoundary() {
  return {
    async reserveBillingOperation(companyId: string, kind: BillingOperation['kind'], key: string, request: Record<string, unknown>) {
      const prior = [...operations.values()].find(op => op.company_id === companyId && op.kind === kind &&
        (op.request_key === key || op.status === 'pending' || op.status === 'checkout'))
      if (prior) return prior
      const op: BillingOperation = {
        id: `fixture-operation-${operations.size + 1}`, company_id: companyId, kind, request_key: key,
        request: structuredClone(request), status: 'pending', stripe_object_id: null, result: {}, created_at: new Date().toISOString(),
      }
      operations.set(op.id, op)
      return op
    },
    async claimBillingOperation(id: string) {
      if (leases.has(id)) return null
      leases.add(id)
      return `lease:${id}`
    },
    async saveBillingOperation(id: string, _token: string, fields: Partial<BillingOperation>) {
      const op = operations.get(id)
      if (!op) throw new Error('Fixture operation missing')
      Object.assign(op, fields)
    },
    async releaseBillingOperation(id: string) { leases.delete(id) },
    canReplayStripeCreate: () => true,
  }
}
