import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { bulkAdjustPriceBookFolder } from '@/lib/actions/price-book'

const mockItems = [
  { id: 'i1', company_id: 'c1', folder_id: 'folder-labor', name: 'General Labor', unit: 'hr', unit_price: 75, notes: null },
  { id: 'i2', company_id: 'c1', folder_id: 'folder-labor', name: 'Supervisor', unit: 'hr', unit_price: 100, notes: null },
]

function makeSupabase(opts: {
  claims: { sub: string } | null
  company: { id: string } | null
  items: typeof mockItems
  upsertError: { message: string } | null
}) {
  const upsertSpy = vi.fn().mockResolvedValue({ error: opts.upsertError, data: opts.items })
  let pbCalls = 0
  // chainable + thenable mock so awaiting the query resolves to {data, error}
  const selectChain: Record<string, any> = {}
  selectChain.select = vi.fn().mockReturnValue(selectChain)
  selectChain.eq = vi.fn().mockReturnValue(selectChain)
  selectChain.is = vi.fn().mockReturnValue(selectChain)
  selectChain.then = vi.fn((resolve: (v: unknown) => unknown) =>
    resolve({ data: opts.items, error: null })
  )
  return {
    upsertSpy,
    selectChain,
    client: {
      auth: { getClaims: vi.fn().mockResolvedValue({ data: opts.claims ? { claims: opts.claims } : null }) },
      from: vi.fn((table: string) => {
        if (table === 'companies') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: opts.company }),
        }
        if (table === 'company_price_book') {
          pbCalls++
          if (pbCalls === 1) return selectChain
          return { upsert: upsertSpy }
        }
      }),
    },
  }
}

describe('bulkAdjustPriceBookFolder', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns { error } when not authenticated', async () => {
    const { client } = makeSupabase({ claims: null, company: null, items: [], upsertError: null })
    vi.mocked(createClient).mockResolvedValue(client as any)
    const result = await bulkAdjustPriceBookFolder('folder-labor', 10)
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns { error } when no company found', async () => {
    const { client } = makeSupabase({ claims: { sub: 'u1' }, company: null, items: [], upsertError: null })
    vi.mocked(createClient).mockResolvedValue(client as any)
    const result = await bulkAdjustPriceBookFolder('folder-labor', 10)
    expect(result).toEqual({ error: 'No company found' })
  })

  it('uses .eq("folder_id", id) when folderId is a UUID', async () => {
    const { client, selectChain } = makeSupabase({
      claims: { sub: 'u1' }, company: { id: 'c1' }, items: mockItems, upsertError: null
    })
    vi.mocked(createClient).mockResolvedValue(client as any)
    await bulkAdjustPriceBookFolder('folder-labor', 10)
    expect(selectChain.eq).toHaveBeenCalledWith('folder_id', 'folder-labor')
    expect(selectChain.is).not.toHaveBeenCalled()
  })

  it('uses .is("folder_id", null) when folderId === null (Uncategorized bucket)', async () => {
    const { client, selectChain } = makeSupabase({
      claims: { sub: 'u1' }, company: { id: 'c1' }, items: mockItems, upsertError: null
    })
    vi.mocked(createClient).mockResolvedValue(client as any)
    await bulkAdjustPriceBookFolder(null, 10)
    expect(selectChain.is).toHaveBeenCalledWith('folder_id', null)
  })

  it('calls upsert with per-item computed prices (10% on 75 = 82.50)', async () => {
    const { client, upsertSpy } = makeSupabase({
      claims: { sub: 'u1' }, company: { id: 'c1' }, items: mockItems, upsertError: null
    })
    vi.mocked(createClient).mockResolvedValue(client as any)
    await bulkAdjustPriceBookFolder('folder-labor', 10)
    expect(upsertSpy).toHaveBeenCalledOnce()
    const upsertArg = upsertSpy.mock.calls[0][0] as { id: string; unit_price: number }[]
    const item1 = upsertArg.find(i => i.id === 'i1')
    expect(item1?.unit_price).toBe(82.50)
    const item2 = upsertArg.find(i => i.id === 'i2')
    expect(item2?.unit_price).toBe(110.00)
  })

  it('returns { data: { updated: 2 } } on success', async () => {
    const { client } = makeSupabase({
      claims: { sub: 'u1' }, company: { id: 'c1' }, items: mockItems, upsertError: null
    })
    vi.mocked(createClient).mockResolvedValue(client as any)
    const result = await bulkAdjustPriceBookFolder('folder-labor', 10)
    expect(result).toEqual({ data: { updated: 2 } })
  })

  it('returns { error } when upsert fails', async () => {
    const { client } = makeSupabase({
      claims: { sub: 'u1' }, company: { id: 'c1' }, items: mockItems,
      upsertError: { message: 'DB error' }
    })
    vi.mocked(createClient).mockResolvedValue(client as any)
    const result = await bulkAdjustPriceBookFolder('folder-labor', 10)
    expect(result).toEqual({ error: 'Failed to apply price adjustment.' })
  })

  it('rounds computed price to 2 decimal places (33% on 33.33)', async () => {
    const singleItem = [{ id: 'ix', company_id: 'c1', folder_id: 'f-x', name: 'Test', unit: 'each', unit_price: 33.33, notes: null }]
    const { client, upsertSpy } = makeSupabase({
      claims: { sub: 'u1' }, company: { id: 'c1' }, items: singleItem, upsertError: null
    })
    vi.mocked(createClient).mockResolvedValue(client as any)
    await bulkAdjustPriceBookFolder('f-x', 33)
    const upsertArg = upsertSpy.mock.calls[0][0] as { unit_price: number }[]
    // 33.33 * 1.33 = 44.3289 → rounds to 44.33
    expect(upsertArg[0].unit_price).toBe(44.33)
  })
})
