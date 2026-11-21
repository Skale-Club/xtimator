import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn().mockResolvedValue('company-123'),
}))
vi.mock('@/lib/demo/guard', () => ({ assertWritable: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/billing/access-guard', () => ({ billingEditDenied: vi.fn().mockResolvedValue(null) }))

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createFolder, reorderFolders, resolveOrCreateFolders } from '@/lib/actions/price-book'

/**
 * A thenable query builder: every chained call returns itself, awaiting it
 * resolves `result`. `calls` records each method call for assertions.
 */
function builder(result: unknown, calls: [string, unknown[]][]) {
  const b: Record<string, unknown> = {}
  const chain = (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, args])
      return b
    }
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'single']) b[m] = chain(m)
  b.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return b
}

function makeClient(opts: {
  /** Existing folders: id + sort_order. */
  folders: { id: string; name?: string; sort_order: number }[]
  updateError?: boolean
}) {
  const calls: [string, unknown[]][] = []
  const updates: { patch: unknown; filters: unknown[][] }[] = []
  const inserts: unknown[] = []
  const from = vi.fn((table: string) => {
    if (table === 'companies') {
      return builder({ data: { id: 'company-123', currency_code: 'USD' } }, calls)
    }
    // price_book_folders: behave by the first verb used on it.
    const verbs: string[] = []
    let patch: unknown
    const filters: unknown[][] = []
    const b: Record<string, unknown> = {}
    const result = () => {
      if (verbs.includes('insert')) {
        const rows = inserts[inserts.length - 1] as { name: string }[] | { name: string }
        const list = Array.isArray(rows) ? rows : [rows]
        const data = list.map((r, i) => ({ id: `new-${i}`, name: r.name }))
        return { data: Array.isArray(rows) ? data : data[0], error: null }
      }
      if (verbs.includes('update')) {
        updates.push({ patch, filters })
        return { data: null, error: opts.updateError ? { message: 'boom' } : null }
      }
      return { data: opts.folders, error: null }
    }
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'single']) {
      b[m] = (...args: unknown[]) => {
        verbs.push(m)
        if (m === 'eq') filters.push(args)
        if (m === 'order' && args[0] === 'sort_order') {
          // "Max sort_order" lookup: return only the highest row.
          const max = [...opts.folders].sort((a, c) => c.sort_order - a.sort_order).slice(0, 1)
          b.then = (res: (v: unknown) => unknown) => res({ data: max, error: null })
        }
        return b
      }
    }
    b.insert = (rows: unknown) => {
      verbs.push('insert')
      inserts.push(rows)
      return b
    }
    b.update = (p: unknown) => {
      verbs.push('update')
      patch = p
      return b
    }
    b.then = (res: (v: unknown) => unknown) => res(result())
    return b
  })
  return {
    client: { auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u1' } } }) }, from },
    updates,
    inserts,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reorderFolders', () => {
  it('writes each folder sort_order as its index, scoped by company', async () => {
    const m = makeClient({ folders: [{ id: 'a', sort_order: 0 }, { id: 'b', sort_order: 1 }, { id: 'c', sort_order: 2 }] })
    vi.mocked(createClient).mockResolvedValue(m.client as never)

    const result = await reorderFolders(['c', 'a', 'b'])

    expect(result).toEqual({ data: true })
    expect(m.updates).toHaveLength(3)
    expect(m.updates.map((u) => u.patch)).toEqual([{ sort_order: 0 }, { sort_order: 1 }, { sort_order: 2 }])
    expect(m.updates[0].filters).toEqual([['id', 'c'], ['company_id', 'company-123']])
    expect(revalidatePath).toHaveBeenCalledWith('/price-book')
  })

  it('rejects an empty list, duplicates, and a set that differs from the company folders', async () => {
    const m = makeClient({ folders: [{ id: 'a', sort_order: 0 }, { id: 'b', sort_order: 1 }] })
    vi.mocked(createClient).mockResolvedValue(m.client as never)

    expect(await reorderFolders([])).toHaveProperty('error')
    expect(await reorderFolders(['a', 'a'])).toHaveProperty('error')
    expect(await reorderFolders(['a'])).toHaveProperty('error') // missing b
    expect(await reorderFolders(['a', 'zzz'])).toHaveProperty('error') // foreign id
    expect(m.updates).toHaveLength(0)
  })

  it('reports a failed update', async () => {
    const m = makeClient({ folders: [{ id: 'a', sort_order: 0 }, { id: 'b', sort_order: 1 }], updateError: true })
    vi.mocked(createClient).mockResolvedValue(m.client as never)
    expect(await reorderFolders(['b', 'a'])).toEqual({ error: 'Failed to reorder categories.' })
  })
})

describe('new folders go to the end', () => {
  it('createFolder uses max sort_order + 1', async () => {
    const m = makeClient({ folders: [{ id: 'a', sort_order: 0 }, { id: 'b', sort_order: 4 }] })
    vi.mocked(createClient).mockResolvedValue(m.client as never)
    await createFolder('  Roofing ')
    expect(m.inserts[0]).toEqual({ company_id: 'company-123', name: 'Roofing', sort_order: 5 })
  })

  it('createFolder starts at 0 for the first folder', async () => {
    const m = makeClient({ folders: [] })
    vi.mocked(createClient).mockResolvedValue(m.client as never)
    await createFolder('First')
    expect(m.inserts[0]).toMatchObject({ sort_order: 0 })
  })

  it('resolveOrCreateFolders gives imported folders sequential sort_order after the max', async () => {
    // Existing rows answer the name lookup too, but none matches "X" / "Y".
    const m = makeClient({ folders: [{ id: 'a', name: 'Labor', sort_order: 2 }] })
    vi.mocked(createClient).mockResolvedValue(m.client as never)
    await resolveOrCreateFolders(['X', 'Y'])
    expect(m.inserts[0]).toEqual([
      { company_id: 'company-123', name: 'X', sort_order: 3 },
      { company_id: 'company-123', name: 'Y', sort_order: 4 },
    ])
  })
})
