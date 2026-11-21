// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY = '99999999-9999-4999-8999-999999999999'

interface Row {
  id: string
  company_id: string
  sort_order: number | null
  created_at: string
}

const h = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; company_id: string; sort_order: number | null; created_at: string }>,
  updates: [] as Array<{ id: string; company_id: unknown; patch: Record<string, unknown> }>,
  demoDenied: null as null | { error: string },
  billingDenied: null as null | { error: string },
  revalidated: [] as string[],
  authed: true,
  failUpdateFor: null as null | string,
  tables: [] as string[],
}))

function makeClient() {
  const from = (table: string) => {
    h.tables.push(table)
    const filters: Record<string, unknown> = {}
    let inIds: string[] | null = null
    let patch: Record<string, unknown> | null = null
    const run = () => {
      let matched = h.rows.filter((row) => row.company_id === filters.company_id)
      if (filters.id !== undefined) matched = matched.filter((row) => row.id === filters.id)
      if (inIds) matched = matched.filter((row) => inIds!.includes(row.id))
      if (patch) {
        if (h.failUpdateFor && filters.id === h.failUpdateFor) return { data: null, error: { message: 'boom' } }
        for (const row of matched) Object.assign(row, patch)
        h.updates.push({ id: String(filters.id), company_id: filters.company_id, patch })
        return { data: matched.map((row) => ({ id: row.id })), error: null }
      }
      const sorted = [...matched].sort((a, b) => {
        if (a.sort_order === null && b.sort_order !== null) return 1
        if (a.sort_order !== null && b.sort_order === null) return -1
        if (a.sort_order !== b.sort_order) return (a.sort_order as number) - (b.sort_order as number)
        return b.created_at.localeCompare(a.created_at)
      })
      return { data: sorted.map((row) => ({ ...row })), error: null }
    }
    const builder: Record<string, unknown> = {
      select: () => builder,
      update: (p: Record<string, unknown>) => {
        patch = p
        return builder
      },
      eq: (key: string, value: unknown) => {
        filters[key] = value
        return builder
      },
      in: (_key: string, values: string[]) => {
        inIds = values
        return builder
      },
      order: () => builder,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    }
    return builder
  }
  return {
    from,
    auth: { getClaims: async () => ({ data: h.authed ? { claims: { sub: 'user-1' } } : null }) },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: async () => COMPANY }))
vi.mock('@/lib/billing/access-guard', () => ({ billingEditDenied: async () => h.billingDenied }))
vi.mock('@/lib/demo/guard', () => ({ assertWritable: async () => h.demoDenied, isDemoSession: async () => false }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => h.revalidated.push(path) }))

import { moveProject } from '@/lib/actions/project-order'

function seed(orders: Array<number | null>, foreign: Row[] = []) {
  h.rows = [
    ...orders.map((sort_order, index) => ({
      id: `p${index + 1}`,
      company_id: COMPANY,
      sort_order,
      // p1 is the newest.
      created_at: `2026-04-${String(20 - index).padStart(2, '0')}T00:00:00Z`,
    })),
    ...foreign,
  ]
}

const row = (id: string) => h.rows.find((r) => r.id === id)!

beforeEach(() => {
  h.rows = []
  h.updates = []
  h.demoDenied = null
  h.billingDenied = null
  h.revalidated = []
  h.authed = true
  h.failUpdateFor = null
  h.tables = []
})

describe('moveProject', () => {
  it('takes the midpoint between the neighbours and writes only the moved row', async () => {
    seed([1, 2, 3, 4])
    const result = await moveProject('p4', { aboveId: 'p1', belowId: 'p2' })
    expect(result).toEqual({ data: { sort_order: 1.5 } })
    expect(h.updates).toHaveLength(1)
    expect(h.updates[0]).toMatchObject({ id: 'p4', company_id: COMPANY, patch: { sort_order: 1.5 } })
    expect(h.revalidated).toEqual(['/projects', '/dashboard'])
  })

  it('goes below the first project when moved to the very top', async () => {
    seed([1, 2, 3])
    const result = await moveProject('p3', { aboveId: null, belowId: 'p1' })
    expect(result).toEqual({ data: { sort_order: 0 } })
  })

  it('goes above the last project when moved to the very bottom', async () => {
    seed([1, 2, 3])
    const result = await moveProject('p1', { aboveId: 'p3', belowId: null })
    expect(result).toEqual({ data: { sort_order: 4 } })
  })

  it('renumbers the company 1..n first when the neighbours are too close, then places the row', async () => {
    seed([1, 1.0000000001, 2, 3, 4])
    const result = await moveProject('p5', { aboveId: 'p1', belowId: 'p2' })
    // p1 stays 1 and p2 becomes 2, so the moved row lands at 1.5.
    expect(result).toEqual({ data: { sort_order: 1.5 } })
    expect(row('p1').sort_order).toBe(1)
    expect(row('p2').sort_order).toBe(2)
    expect(row('p3').sort_order).toBe(3)
    expect(row('p4').sort_order).toBe(4)
    expect(row('p5').sort_order).toBe(1.5)
    for (const update of h.updates) expect(update.company_id).toBe(COMPANY)
  })

  it('renumbers when a neighbour has no sort_order yet (nulls last, newest first)', async () => {
    seed([1, null, null])
    const result = await moveProject('p1', { aboveId: 'p2', belowId: 'p3' })
    // After renumbering p1=1, p2=2, p3=3 the midpoint of p2 and p3 is 2.5.
    expect(result).toEqual({ data: { sort_order: 2.5 } })
    expect(row('p2').sort_order).toBe(2)
    expect(row('p3').sort_order).toBe(3)
  })

  it('rejects a neighbour that belongs to another company', async () => {
    seed([1, 2], [{ id: 'x1', company_id: OTHER_COMPANY, sort_order: 1, created_at: '2026-01-01T00:00:00Z' }])
    expect(await moveProject('p1', { aboveId: 'x1', belowId: null })).toEqual({ error: 'Project not found.' })
    expect(await moveProject('x1', { aboveId: 'p2', belowId: null })).toEqual({ error: 'Project not found.' })
    expect(h.updates).toHaveLength(0)
    expect(h.revalidated).toEqual([])
  })

  it('rejects a move with no neighbours or repeated ids', async () => {
    seed([1, 2, 3])
    expect(await moveProject('p1', { aboveId: null, belowId: null })).toEqual({ error: 'Invalid position.' })
    expect(await moveProject('p1', { aboveId: 'p1', belowId: 'p2' })).toEqual({ error: 'Invalid position.' })
    expect(await moveProject('p1', { aboveId: 'p2', belowId: 'p2' })).toEqual({ error: 'Invalid position.' })
    expect(h.updates).toHaveLength(0)
  })

  it('reports a failed write without revalidating', async () => {
    seed([1, 2, 3])
    h.failUpdateFor = 'p3'
    expect(await moveProject('p3', { aboveId: 'p1', belowId: 'p2' })).toEqual({ error: 'Failed to move the project.' })
    expect(h.revalidated).toEqual([])
  })

  it('does nothing when the user is not signed in', async () => {
    seed([1, 2])
    h.authed = false
    expect(await moveProject('p1', { aboveId: 'p2', belowId: null })).toEqual({ error: 'Not authenticated' })
    expect(h.tables).toEqual([])
  })

  it('is blocked in a demo session before any query', async () => {
    seed([1, 2])
    h.demoDenied = { error: 'demo' }
    expect(await moveProject('p1', { aboveId: 'p2', belowId: null })).toEqual({ error: 'demo' })
    expect(h.tables).toEqual([])
    expect(h.updates).toHaveLength(0)
  })

  it('is blocked when billing denies edits', async () => {
    seed([1, 2])
    h.billingDenied = { error: 'billing' }
    expect(await moveProject('p1', { aboveId: 'p2', belowId: null })).toEqual({ error: 'billing' })
    expect(h.tables).toEqual([])
    expect(h.updates).toHaveLength(0)
  })

  it('never touches the estimates table', async () => {
    seed([1, 2, 3])
    await moveProject('p3', { aboveId: 'p1', belowId: 'p2' })
    expect(h.tables.every((table) => table === 'projects')).toBe(true)
  })
})
