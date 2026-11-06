import { beforeEach, describe, expect, it, vi } from 'vitest'

// SEED-056 Phase B: zod boundary + persisted shape of updateDocumentBlocks.

const updateMock = vi.fn()
const eqMock = vi.fn()
const getClaimsMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
    from: vi.fn(() => ({ update: updateMock })),
  })),
}))
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(async () => 'company-1'),
}))
vi.mock('@/lib/demo/guard', () => ({ assertWritable: vi.fn(async () => null) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))

import { updateDocumentBlocks } from '@/lib/actions/document-blocks'
import { assertWritable } from '@/lib/demo/guard'

const valid = {
  summary: true,
  payment_terms: false,
  warranty_terms: true,
  timeline: false,
  notes: true,
  photos: true,
  estimate_terms: false,
  valid_until: true,
}

describe('updateDocumentBlocks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    eqMock.mockResolvedValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    vi.mocked(assertWritable).mockResolvedValue(null as never)
  })

  it('persists exactly the eight known keys on the active company', async () => {
    const result = await updateDocumentBlocks(valid)
    expect(result).toEqual({ success: true })
    expect(updateMock).toHaveBeenCalledWith({ document_blocks: valid })
    expect(eqMock).toHaveBeenCalledWith('id', 'company-1')
  })

  it('drops unknown keys', async () => {
    await updateDocumentBlocks({ ...valid, bogus: true } as never)
    expect(Object.keys(updateMock.mock.calls[0][0].document_blocks).sort()).toEqual(Object.keys(valid).sort())
  })

  it('rejects a partial or non-boolean payload without touching the database', async () => {
    expect(await updateDocumentBlocks({ summary: true } as never)).toEqual({
      error: 'Invalid document block settings.',
    })
    expect(await updateDocumentBlocks({ ...valid, notes: 'yes' } as never)).toEqual({
      error: 'Invalid document block settings.',
    })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null } })
    expect(await updateDocumentBlocks(valid)).toEqual({ error: 'Not authenticated' })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('stops at the demo write guard', async () => {
    vi.mocked(assertWritable).mockResolvedValue({ error: 'Demo is read-only' } as never)
    expect(await updateDocumentBlocks(valid)).toEqual({ error: 'Demo is read-only' })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('surfaces a database failure', async () => {
    eqMock.mockResolvedValue({ error: { message: 'boom' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await updateDocumentBlocks(valid)).toEqual({
      error: 'Failed to save document blocks. Please try again.',
    })
    spy.mockRestore()
  })
})
