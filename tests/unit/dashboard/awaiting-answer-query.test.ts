import { describe, it, expect } from 'vitest'
import { getDashboardStats } from '@/lib/queries/dashboard'

type Call = { table: string; ops: Array<[string, unknown[]]> }

function makeSupabase(calls: Call[]) {
  return {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const result = { count: 11, data: [] as unknown[] }
      const chain: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'is', 'in']) {
        chain[op] = (...args: unknown[]) => {
          call.ops.push([op, args])
          return chain
        }
      }
      chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
      return chain
    },
  } as never
}

describe('getDashboardStats awaiting answer', () => {
  it('counts every current estimate with no client response, not only draft/sent', async () => {
    const calls: Call[] = []
    const stats = await getDashboardStats(makeSupabase(calls), 'co-1')
    const pending = calls.find((c) =>
      c.ops.some(([op, a]) => op === 'select' && String(a[0]).includes('projects!estimates_project_id_fkey!inner')),
    )!
    expect(pending.ops).toContainEqual(['is', ['client_response', null]])
    expect(pending.ops).toContainEqual(['eq', ['is_current', true]])
    expect(pending.ops.some(([op]) => op === 'in')).toBe(false)
    expect(stats.pendingEstimates).toBe(11)
  })
})
