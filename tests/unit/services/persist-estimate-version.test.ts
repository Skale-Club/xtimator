import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { persistEstimateVersion, type PersistEstimateVersionArgs } from '@/lib/services/persist-estimate-version'

const args: PersistEstimateVersionArgs = {
  companyId: 'company-1',
  projectId: 'project-1',
  estimateRow: { company_id: 'company-1', project_id: 'project-1', is_current: true },
  aiMeta: null,
  calculatedSections: [],
  previousCurrentId: 'estimate-previous',
  projectUpdate: { status: 'estimate_ready', total: 1120 },
}

function makeDb() {
  const insert = vi.fn(() => ({
    select: () => ({ single: async () => ({ data: { id: 'estimate-staged' }, error: null }) }),
  }))
  type EstimateRow = { id: string; version: number; is_current: boolean; generation_staged: boolean }
  const readRow = vi.fn<() => Promise<{ data: EstimateRow | null; error: { message: string } | null }>>()
    .mockResolvedValue({ data: null, error: null })
  const readFilters = vi.fn().mockReturnThis()
  const select = vi.fn(() => ({ eq: readFilters, maybeSingle: readRow }))
  const cleanup = vi.fn<() => Promise<{ error: { message: string } | null }>>().mockResolvedValue({ error: null })
  const filters = vi.fn().mockReturnThis()
  const deleteEstimate = vi.fn(() => ({
    eq: filters,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      cleanup().then(resolve, reject),
  }))
  const from = vi.fn((table: string) => {
    if (table !== 'estimates') throw new Error(`Unexpected table ${table}`)
    return { insert, select, delete: deleteEstimate }
  })
  const rpc = vi.fn<() => Promise<{
    data: { estimate_id: string; version: number } | null
    error: { message: string } | null
  }>>().mockResolvedValue({ data: { estimate_id: 'estimate-staged', version: 8 }, error: null })
  return { client: { from, rpc } as unknown as SupabaseClient, insert, readRow, readFilters, deleteEstimate, cleanup, filters, rpc }
}

function expectStagedCleanup(db: ReturnType<typeof makeDb>) {
  expect(db.deleteEstimate).toHaveBeenCalledOnce()
  expect(db.filters.mock.calls).toEqual(expect.arrayContaining([
    ['id', 'estimate-staged'],
    ['company_id', 'company-1'],
    ['project_id', 'project-1'],
    ['is_current', false],
    ['generation_staged', true],
  ]))
}

describe('persistEstimateVersion', () => {
  afterEach(() => vi.restoreAllMocks())

  it('stages a non-current row and reports the committed version from the RPC', async () => {
    const db = makeDb()
    const onCommitted = vi.fn()

    await expect(persistEstimateVersion(db.client, { ...args, onCommitted })).resolves.toBe('estimate-staged')

    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ is_current: false, generation_staged: true }))
    expect(db.rpc).toHaveBeenCalledWith('activate_estimate_version', {
      p_company_id: 'company-1',
      p_project_id: 'project-1',
      p_estimate_id: 'estimate-staged',
      p_previous_estimate_id: 'estimate-previous',
      p_project_update: { status: 'estimate_ready', total: 1120 },
      p_discard_estimate_id: null,
      p_restore: false,
      p_keep_existing: false,
    })
    expect(onCommitted).toHaveBeenCalledExactlyOnceWith(8)
    expect(db.deleteEstimate).not.toHaveBeenCalled()
  })

  it('fails closed on an activation error or missing RPC acknowledgement', async () => {
    const onCommitted = vi.fn()
    const failed = { message: 'current estimate changed' }
    for (const error of [failed, null]) {
      const db = makeDb()
      db.rpc.mockResolvedValueOnce({ data: null, error })

      await expect(persistEstimateVersion(db.client, { ...args, onCommitted })).rejects.toThrow('Failed to activate estimate version')

      expectStagedCleanup(db)
    }
    expect(onCommitted).not.toHaveBeenCalled()
  })

  it('recovers a lost acknowledgement by confirming the staged version committed', async () => {
    const db = makeDb()
    const onCommitted = vi.fn()
    db.rpc.mockRejectedValueOnce(new Error('connection closed before response'))
    db.readRow.mockResolvedValueOnce({
      data: { id: 'estimate-staged', version: 8, is_current: true, generation_staged: false },
      error: null,
    })

    await expect(persistEstimateVersion(db.client, { ...args, onCommitted })).resolves.toBe('estimate-staged')

    expect(db.readFilters.mock.calls).toEqual(expect.arrayContaining([
      ['id', 'estimate-staged'], ['company_id', 'company-1'], ['project_id', 'project-1'],
    ]))
    expect(onCommitted).toHaveBeenCalledExactlyOnceWith(8)
    expect(db.deleteEstimate).not.toHaveBeenCalled()
  })

  it('scopes cleanup to uncommitted non-current rows after an ambiguous response', async () => {
    const db = makeDb()
    const lostResponse = new Error('connection closed before response')
    const cleanupError = { message: 'cleanup request failed' }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.rpc.mockRejectedValueOnce(lostResponse)
    db.cleanup.mockResolvedValueOnce({ error: cleanupError })

    await expect(persistEstimateVersion(db.client, args)).rejects.toBe(lostResponse)

    expectStagedCleanup(db)
    expect(log).toHaveBeenCalledWith(expect.any(String), cleanupError)
  })

  it('does not treat a version that was already superseded as the current commit', async () => {
    const db = makeDb()
    const onCommitted = vi.fn()
    db.rpc.mockResolvedValueOnce({ data: null, error: null })
    db.readRow.mockResolvedValueOnce({
      data: { id: 'estimate-staged', version: 8, is_current: false, generation_staged: false },
      error: null,
    })

    await expect(persistEstimateVersion(db.client, { ...args, onCommitted })).rejects.toThrow('Failed to activate estimate version')

    expect(onCommitted).not.toHaveBeenCalled()
    expectStagedCleanup(db)
  })

  it('returns the existing current version when a concurrent blank creation wins', async () => {
    const db = makeDb()
    const onCommitted = vi.fn()
    db.rpc.mockResolvedValueOnce({ data: { estimate_id: 'estimate-winner', version: 4 }, error: null })

    await expect(persistEstimateVersion(db.client, { ...args, keepExisting: true, onCommitted })).resolves.toBe('estimate-winner')

    expect(db.rpc).toHaveBeenCalledWith('activate_estimate_version', expect.objectContaining({ p_keep_existing: true }))
    expect(onCommitted).toHaveBeenCalledExactlyOnceWith(4)
    expectStagedCleanup(db)
  })
})
