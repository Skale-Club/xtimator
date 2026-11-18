import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { getCurrentEstimate, getEstimateById, getProjectEstimates } from '@/lib/queries/estimate'

function mockEstimateRead(data: unknown) {
  const query = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error: null }),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  }
  const from = vi.fn((table: string) => {
    if (table !== 'estimates') throw new Error(`Unexpected read from ${table}`)
    return { select: () => query }
  })
  return { from, client: { from } as unknown as SupabaseClient }
}

describe('estimate staging visibility', () => {
  it('omits uncommitted versions from history and keeps committed and legacy versions', async () => {
    const staged = { id: 'estimate-staged', generation_staged: true, version: 3 }
    const current = { id: 'estimate-current', generation_staged: false, version: 2 }
    const legacy = { id: 'estimate-legacy', version: 1 }
    const db = mockEstimateRead([staged, current, legacy])

    await expect(getProjectEstimates(db.client, 'project-1')).resolves.toEqual([current, legacy])
  })

  it('does not load children for a directly requested staged estimate', async () => {
    const db = mockEstimateRead({ id: 'estimate-staged', generation_staged: true })

    await expect(getEstimateById(db.client, 'estimate-staged')).resolves.toBeNull()

    expect(db.from).toHaveBeenCalledExactlyOnceWith('estimates')
  })

  it('rejects a staging row returned by the current-estimate lookup', async () => {
    const db = mockEstimateRead({ id: 'estimate-staged', is_current: true, generation_staged: true })

    await expect(getCurrentEstimate(db.client, 'project-1')).resolves.toBeNull()

    expect(db.from).toHaveBeenCalledExactlyOnceWith('estimates')
  })
})
