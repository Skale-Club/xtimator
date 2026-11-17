import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDashboardStats } from '@/lib/queries/dashboard'

/**
 * Accepted revenue = accepted current estimates + approved change orders of
 * those estimates. Counts are about estimates and stay unchanged.
 */

type Row = Record<string, unknown>

function fakeClient(opts: { estimates: Row[]; changeOrders: Row[] }) {
  const changeOrderFilters: Array<[string, unknown]> = []

  const from = (table: string) => {
    const predicates: Array<(r: Row) => boolean> = []
    let head = false
    const chain: Record<string, unknown> = {}
    chain.select = (_cols: string, o?: { head?: boolean }) => {
      head = !!o?.head
      return chain
    }
    chain.eq = (c: string, v: unknown) => {
      predicates.push((r) => r[c] === v)
      if (table === 'change_orders') changeOrderFilters.push([c, v])
      return chain
    }
    chain.is = () => chain
    chain.in = (c: string, v: unknown[]) => {
      predicates.push((r) => v.includes(r[c]))
      return chain
    }
    chain.then = (resolve: (v: unknown) => unknown) => {
      let rows: Row[] = []
      if (table === 'estimates') {
        rows = opts.estimates.filter((r) => predicates.every((p) => p(r)))
      } else if (table === 'change_orders') {
        rows = opts.changeOrders
      }
      return Promise.resolve(head ? { count: rows.length } : { data: rows }).then(resolve)
    }
    return chain
  }
  return { client: { from } as unknown as SupabaseClient, changeOrderFilters }
}

describe('getDashboardStats revenue with change orders', () => {
  it('adds approved change orders to the accepted estimate totals', async () => {
    const { client } = fakeClient({
      estimates: [
        { company_id: 'c1', is_current: true, client_response: 'accepted', total: 1000 },
        { company_id: 'c1', is_current: true, client_response: 'accepted', total: 500 },
      ],
      changeOrders: [{ total: 250.5 }, { total: -100.25 }],
    })
    const stats = await getDashboardStats(client, 'c1')
    expect(stats.totalRevenue).toBe(1650.25)
  })

  it('keeps the estimate counts unchanged (a change order is not an estimate)', async () => {
    const { client } = fakeClient({
      estimates: [{ company_id: 'c1', is_current: true, client_response: 'accepted', total: 1000 }],
      changeOrders: [{ total: 300 }],
    })
    const stats = await getDashboardStats(client, 'c1')
    expect(stats.acceptedEstimates).toBe(1)
    expect(stats.pendingEstimates).toBe(0)
    expect(stats.totalRevenue).toBe(1300)
  })

  it('only asks for approved change orders of the accepted CURRENT estimate, scoped to the company', async () => {
    const { client, changeOrderFilters } = fakeClient({ estimates: [], changeOrders: [] })
    await getDashboardStats(client, 'c1')
    expect(changeOrderFilters).toEqual(
      expect.arrayContaining([
        ['company_id', 'c1'],
        ['client_response', 'accepted'],
        ['estimates.is_current', true],
        ['estimates.client_response', 'accepted'],
      ]),
    )
  })

  it('with no change orders the revenue is exactly the estimate sum', async () => {
    const { client } = fakeClient({
      estimates: [{ company_id: 'c1', is_current: true, client_response: 'accepted', total: 4000 }],
      changeOrders: [],
    })
    expect((await getDashboardStats(client, 'c1')).totalRevenue).toBe(4000)
  })
})
