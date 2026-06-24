import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * KOVL-01 + KOVL-02: createCompanyEntry / updateCompanyEntry / deleteCompanyEntry
 * server actions — the TENANT company-KB-overlay data layer.
 *
 * The mirror of the Phase-119 super-admin curation test, RETARGETED to the three
 * security-critical substitutions:
 *   1. Auth   = tenant active-company context (getClaims + getActiveCompanyId +
 *               assertWritable), NOT requireAdmin().
 *   2. Scope  = scope='company', company_id=<active company>, industry_id=null,
 *               NOT scope='industry'.
 *   3. Client = the RLS-bound AUTHED createClient() from @/lib/supabase/server,
 *               NOT requireServiceClient().
 *
 * Invariants under test (ZERO live network/DB — everything mocked):
 *   - createCompanyEntry embeds BEFORE insert; insert pins scope/company_id/
 *     industry_id; the embedding is a non-null 1536-vector.
 *   - embed() throwing → { ok:false } AND .insert NOT called (block-the-save).
 *   - Unauthenticated / no-active-company / demo session → { ok:false }, no write.
 *   - updateCompanyEntry re-embeds ONLY when title/body changed.
 *   - The AUTHED client.from() is used; requireServiceClient is NEVER called.
 */

// ---- mocks -----------------------------------------------------------------

const insertMock = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}))
const updateEqMock = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}))
const deleteEqMock = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}))
const selectSingleMock = vi.fn(
  async (): Promise<{
    data: { title: string; body: string } | null
    error: { message: string } | null
  }> => ({ data: { title: 'Old title', body: 'Old body' }, error: null })
)

let lastInsertPayload: Record<string, unknown> | null = null
let lastUpdatePayload: Record<string, unknown> | null = null

const fromMock = vi.fn((_table: string) => ({
  insert: (payload: Record<string, unknown>) => {
    lastInsertPayload = payload
    return insertMock()
  },
  update: (payload: Record<string, unknown>) => {
    lastUpdatePayload = payload
    // overlay update is scoped by .eq('id', id).eq('company_id', company.id)
    return { eq: () => ({ eq: () => updateEqMock() }) }
  },
  // overlay delete is scoped by .eq('id', id).eq('company_id', company.id)
  delete: () => ({ eq: () => ({ eq: () => deleteEqMock() }) }),
  // overlay update fetches existing title/body scoped by id + company_id, then maybeSingle()
  select: () => ({
    eq: () => ({ eq: () => ({ maybeSingle: () => selectSingleMock() }) }),
  }),
}))

const getClaimsMock = vi.fn(async () => ({
  data: { claims: { sub: 'user-1', email: 'o@x.com' } as { sub: string; email: string } | null },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: () => getClaimsMock() },
    from: fromMock,
  }),
}))

const getActiveCompanyIdMock = vi.fn(async (): Promise<string | null> => 'company-1')
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: () => getActiveCompanyIdMock(),
}))

const assertWritableMock = vi.fn(async (): Promise<{ error: string } | null> => null)
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: () => assertWritableMock(),
}))

const embedMock = vi.fn(async () => Array.from({ length: 1536 }, () => 0.001))
vi.mock('@/lib/knowledge/embed', () => ({
  embed: () => embedMock(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Guard against regression: the overlay must NEVER use the service client.
const requireServiceClientMock = vi.fn(() => {
  throw new Error('overlay must not use the service client')
})
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => requireServiceClientMock(),
}))

// ---- import under test (after mocks) ---------------------------------------
import {
  createCompanyEntry,
  updateCompanyEntry,
  deleteCompanyEntry,
} from '@/lib/actions/company-knowledge'

const validInput = {
  title: 'Our 3-step roof flashing process',
  body: 'Step 1... Step 2... Step 3...',
  source: 'internal SOP',
}

beforeEach(() => {
  insertMock.mockClear()
  insertMock.mockResolvedValue({ error: null })
  updateEqMock.mockClear()
  updateEqMock.mockResolvedValue({ error: null })
  deleteEqMock.mockClear()
  deleteEqMock.mockResolvedValue({ error: null })
  selectSingleMock.mockClear()
  selectSingleMock.mockResolvedValue({
    data: { title: 'Old title', body: 'Old body' },
    error: null,
  })
  fromMock.mockClear()
  getClaimsMock.mockClear()
  getClaimsMock.mockResolvedValue({
    data: { claims: { sub: 'user-1', email: 'o@x.com' } },
  })
  getActiveCompanyIdMock.mockClear()
  getActiveCompanyIdMock.mockResolvedValue('company-1')
  assertWritableMock.mockClear()
  assertWritableMock.mockResolvedValue(null)
  embedMock.mockClear()
  embedMock.mockResolvedValue(Array.from({ length: 1536 }, () => 0.001))
  requireServiceClientMock.mockClear()
  lastInsertPayload = null
  lastUpdatePayload = null
})

describe('createCompanyEntry (KOVL-01 + KOVL-02)', () => {
  it('1. embeds then inserts a company-scoped row with scope/company_id/industry_id invariants', async () => {
    const res = await createCompanyEntry(validInput)
    expect(res.ok).toBe(true)

    // embed-then-insert: embed called before insert.
    expect(embedMock).toHaveBeenCalledTimes(1)
    expect(insertMock).toHaveBeenCalledTimes(1)

    expect(lastInsertPayload?.scope).toBe('company')
    expect(lastInsertPayload?.company_id).toBe('company-1')
    expect(lastInsertPayload?.industry_id).toBeNull()
    expect(lastInsertPayload?.title).toBe(validInput.title)
    expect(lastInsertPayload?.source).toBe('internal SOP')

    const emb = lastInsertPayload?.embedding
    const vec = typeof emb === 'string' ? (JSON.parse(emb) as number[]) : (emb as number[])
    expect(Array.isArray(vec)).toBe(true)
    expect(vec).toHaveLength(1536)
  })

  it('2. embed failure blocks the save — returns ok:false and does NOT insert', async () => {
    embedMock.mockRejectedValueOnce(new Error('embeddings 500'))
    const res = await createCompanyEntry(validInput)
    expect(res.ok).toBe(false)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('3. unauthenticated (no claims) → ok:false, no embed, no insert', async () => {
    getClaimsMock.mockResolvedValueOnce({ data: { claims: null } })
    const res = await createCompanyEntry(validInput)
    expect(res.ok).toBe(false)
    expect(embedMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('4. no active company → ok:false, no insert', async () => {
    getActiveCompanyIdMock.mockResolvedValueOnce(null)
    const res = await createCompanyEntry(validInput)
    expect(res.ok).toBe(false)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('5. demo session → ok:false, no embed, no insert', async () => {
    assertWritableMock.mockResolvedValueOnce({ error: 'read-only demo' })
    const res = await createCompanyEntry(validInput)
    expect(res.ok).toBe(false)
    expect(embedMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })
})

describe('updateCompanyEntry (KOVL-01 + KOVL-02)', () => {
  it('6. unchanged title/body → does NOT re-embed; update has no embedding key', async () => {
    selectSingleMock.mockResolvedValueOnce({
      data: { title: validInput.title, body: validInput.body },
      error: null,
    })
    const res = await updateCompanyEntry('entry-1', validInput)
    expect(res.ok).toBe(true)
    expect(embedMock).not.toHaveBeenCalled()
    expect(lastUpdatePayload).not.toHaveProperty('embedding')
  })

  it('7. changed body → re-embeds and includes a 1536-vector in the update', async () => {
    selectSingleMock.mockResolvedValueOnce({
      data: { title: validInput.title, body: 'totally different body' },
      error: null,
    })
    const res = await updateCompanyEntry('entry-1', validInput)
    expect(res.ok).toBe(true)
    expect(embedMock).toHaveBeenCalledTimes(1)
    const emb = lastUpdatePayload?.embedding
    const vec = typeof emb === 'string' ? (JSON.parse(emb) as number[]) : (emb as number[])
    expect(vec).toHaveLength(1536)
  })

  it('8. embed failure on a changed body blocks the update', async () => {
    selectSingleMock.mockResolvedValueOnce({ data: { title: 'x', body: 'y' }, error: null })
    embedMock.mockRejectedValueOnce(new Error('embeddings 500'))
    const res = await updateCompanyEntry('entry-1', validInput)
    expect(res.ok).toBe(false)
    expect(updateEqMock).not.toHaveBeenCalled()
  })
})

describe('deleteCompanyEntry (KOVL-01)', () => {
  it('9. deletes the row scoped to the owning company', async () => {
    const res = await deleteCompanyEntry('entry-1')
    expect(res.ok).toBe(true)
    expect(deleteEqMock).toHaveBeenCalledTimes(1)
  })

  it('10. the AUTHED createClient.from() is used; requireServiceClient is NEVER called', async () => {
    await createCompanyEntry(validInput)
    expect(fromMock).toHaveBeenCalledWith('knowledge_entries')
    expect(requireServiceClientMock).not.toHaveBeenCalled()
  })
})
