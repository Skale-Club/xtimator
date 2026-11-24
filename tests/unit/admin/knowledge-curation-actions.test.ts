import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * KCUR-01 + KCUR-02: createEntry / updateEntry / deleteEntry server actions —
 * the super-admin industry KB curation data layer.
 *
 * Invariants under test (mocked requireAdmin + requireServiceClient + embed +
 * audit-log + next/cache — ZERO live network/DB):
 *   1. createEntry: requireAdmin() FIRST; insert payload has scope='industry',
 *      industry_id=chosen, company_id=null; embedding is a non-null 1536-vector.
 *   2. createEntry: embed() throwing → { ok:false } AND .insert NOT called
 *      (KCUR-02 embed-then-insert; block-the-save).
 *   3. updateEntry: unchanged title/body → embed() NOT called (re-embed only on
 *      change); changed body → embed() called and embedding included in update.
 *   4. deleteEntry: calls .delete and logs 'knowledge_entry.delete'.
 *   5. Unauthenticated (requireAdmin rejects) → no service write occurs.
 */

// ---- mocks -----------------------------------------------------------------
const requireAdminMock = vi.fn(async () => ({ userId: 'admin-1', email: 'a@x.com' }))
vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: () => requireAdminMock(),
}))

const insertMock = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}))
type Filters = Record<string, string>
const industryEntry = {
  id: 'entry-1', scope: 'industry', industry_id: 'house_cleaning',
  title: 'Old title', body: 'Old body', source: null,
}
type StoredEntry = Omit<typeof industryEntry, 'industry_id'> & { industry_id: string | null }
type QueryResult = { data: StoredEntry | null; error: { message: string } | null }
let entry: StoredEntry | null

function matchingEntry(filters: Filters) {
  const row = entry
  if (!row) return null
  return Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value) ? row : null
}

const selectSingleMock = vi.fn(async (filters: Filters): Promise<QueryResult> => ({ data: matchingEntry(filters), error: null }))
const updateEqMock = vi.fn(async (filters: Filters) => ({ data: matchingEntry(filters), error: null }))
const deleteEqMock = vi.fn(async (filters: Filters) => ({ data: matchingEntry(filters), error: null }))

function scopedQuery(run: (filters: Filters) => Promise<QueryResult>) {
  const filters: Filters = {}
  const query = {
    eq(column: string, value: string) { filters[column] = value; return query },
    select: () => query,
    maybeSingle: () => run({ ...filters }),
  }
  return query
}

let lastInsertPayload: Record<string, unknown> | null = null
let lastUpdatePayload: Record<string, unknown> | null = null

const fromMock = vi.fn((_table: string) => ({
  insert: (payload: Record<string, unknown>) => {
    lastInsertPayload = payload
    return insertMock()
  },
  update: (payload: Record<string, unknown>) => {
    lastUpdatePayload = payload
    return scopedQuery(updateEqMock)
  },
  delete: () => scopedQuery(deleteEqMock),
  select: () => scopedQuery(selectSingleMock),
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: fromMock }),
}))

const embedMock = vi.fn(async () => Array.from({ length: 1536 }, () => 0.001))
vi.mock('@/lib/knowledge/embed', () => ({
  embed: () => embedMock(),
}))

const logAdminActionMock = vi.fn(async (_params: { action?: string }) => undefined)
vi.mock('@/lib/admin/audit-log', () => ({
  logAdminAction: (params: { action?: string }) => logAdminActionMock(params),
}))

const revalidatePathMock = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePathMock(path) }))
const notFoundError = new Error('NEXT_NOT_FOUND')
vi.mock('next/navigation', () => ({ notFound: () => { throw notFoundError } }))
vi.mock('@/app/admin/knowledge/[id]/edit-entry-wrapper', () => ({ EditEntryWrapper: () => null }))

// ---- import under test (after mocks) ---------------------------------------
import { createEntry, updateEntry, deleteEntry } from '@/app/admin/knowledge/actions'
import EditKnowledgeEntryPage from '@/app/admin/knowledge/[id]/page'

const validInput = {
  industry_id: 'house_cleaning',
  title: 'Pet odor pre-treatment',
  body: 'Apply enzymatic cleaner, dwell 10-15 min before extraction.',
  source: 'ICAN best-practices',
}

beforeEach(() => {
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 'admin-1', email: 'a@x.com' })
  insertMock.mockClear()
  insertMock.mockResolvedValue({ error: null })
  updateEqMock.mockClear()
  deleteEqMock.mockClear()
  selectSingleMock.mockClear()
  fromMock.mockClear()
  embedMock.mockClear()
  embedMock.mockResolvedValue(Array.from({ length: 1536 }, () => 0.001))
  logAdminActionMock.mockClear()
  revalidatePathMock.mockClear()
  entry = { ...industryEntry }
  lastInsertPayload = null
  lastUpdatePayload = null
})

describe('createEntry (KCUR-01 + KCUR-02)', () => {
  it('1. embeds then inserts an industry row with scope/industry_id/company_id invariants', async () => {
    const res = await createEntry(validInput)
    expect(res.ok).toBe(true)

    // requireAdmin gate ran before the write.
    expect(requireAdminMock).toHaveBeenCalledTimes(1)
    // embed-then-insert: embed called before insert.
    expect(embedMock).toHaveBeenCalledTimes(1)
    expect(insertMock).toHaveBeenCalledTimes(1)

    expect(lastInsertPayload?.scope).toBe('industry')
    expect(lastInsertPayload?.industry_id).toBe('house_cleaning')
    expect(lastInsertPayload?.company_id).toBeNull()
    expect(lastInsertPayload?.title).toBe(validInput.title)
    expect(lastInsertPayload?.source).toBe('ICAN best-practices')

    // embedding persisted as a non-null 1536-length vector (array or its JSON literal).
    const emb = lastInsertPayload?.embedding
    const vec =
      typeof emb === 'string' ? (JSON.parse(emb) as number[]) : (emb as number[])
    expect(Array.isArray(vec)).toBe(true)
    expect(vec).toHaveLength(1536)

    expect(logAdminActionMock).toHaveBeenCalledTimes(1)
  })

  it('2. embed failure blocks the save — returns ok:false and does NOT insert', async () => {
    embedMock.mockRejectedValueOnce(new Error('embeddings 500'))
    const res = await createEntry(validInput)
    expect(res.ok).toBe(false)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('3. invalid industry_id → ok:false, no embed, no insert', async () => {
    const res = await createEntry({ ...validInput, industry_id: 'not_a_trade' })
    expect(res.ok).toBe(false)
    expect(embedMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('4. non-admin rejected before any write', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(createEntry(validInput)).rejects.toThrow()
    expect(insertMock).not.toHaveBeenCalled()
    expect(embedMock).not.toHaveBeenCalled()
  })
})

describe('updateEntry (KCUR-01 + KCUR-02)', () => {
  it('1. unchanged title/body → does NOT re-embed; update has no embedding key', async () => {
    entry = { ...industryEntry, title: validInput.title, body: validInput.body }
    const res = await updateEntry('entry-1', validInput)
    expect(res.ok).toBe(true)
    expect(embedMock).not.toHaveBeenCalled()
    expect(lastUpdatePayload).not.toHaveProperty('embedding')
    expect(updateEqMock).toHaveBeenCalledExactlyOnceWith({ id: 'entry-1', scope: 'industry' })
  })

  it('2. changed body → re-embeds and includes a 1536-vector in the update', async () => {
    entry = { ...industryEntry, title: validInput.title, body: 'totally different body' }
    const res = await updateEntry('entry-1', validInput)
    expect(res.ok).toBe(true)
    expect(embedMock).toHaveBeenCalledTimes(1)
    const emb = lastUpdatePayload?.embedding
    const vec =
      typeof emb === 'string' ? (JSON.parse(emb) as number[]) : (emb as number[])
    expect(vec).toHaveLength(1536)
    expect(logAdminActionMock).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ action: 'knowledge_entry.save' }))
  })

  it('3. embed failure on a changed body blocks the update', async () => {
    embedMock.mockRejectedValueOnce(new Error('embeddings 500'))
    const res = await updateEntry('entry-1', validInput)
    expect(res.ok).toBe(false)
    expect(updateEqMock).not.toHaveBeenCalled()
  })

  it('4. non-admin rejected before any write', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(updateEntry('entry-1', validInput)).rejects.toThrow()
    expect(updateEqMock).not.toHaveBeenCalled()
  })
})

describe('deleteEntry (KCUR-01)', () => {
  it('1. deletes the row and logs knowledge_entry.delete', async () => {
    const res = await deleteEntry('entry-1')
    expect(res.ok).toBe(true)
    expect(deleteEqMock).toHaveBeenCalledExactlyOnceWith({ id: 'entry-1', scope: 'industry' })
    expect(logAdminActionMock).toHaveBeenCalledTimes(1)
    const arg = logAdminActionMock.mock.calls[0]?.[0]
    expect(arg?.action).toBe('knowledge_entry.delete')
  })

  it('2. non-admin rejected before any write', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(deleteEntry('entry-1')).rejects.toThrow()
    expect(deleteEqMock).not.toHaveBeenCalled()
  })
})

describe('industry curation scope', () => {
  const params = () => Promise.resolve({ id: 'entry-1' })

  it('renders an existing industry entry only after admin authorization', async () => {
    await expect(EditKnowledgeEntryPage({ params: params() })).resolves.toBeTruthy()
    expect(requireAdminMock).toHaveBeenCalledBefore(fromMock)
    expect(selectSingleMock).toHaveBeenCalledExactlyOnceWith({ id: 'entry-1', scope: 'industry' })
  })

  it('does not query an entry for a non-admin', async () => {
    requireAdminMock.mockRejectedValueOnce(notFoundError)
    await expect(EditKnowledgeEntryPage({ params: params() })).rejects.toBe(notFoundError)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it.each(['company', 'missing'])('does not render or mutate a %s entry', async scenario => {
    entry = scenario === 'company' ? { ...industryEntry, scope: 'company', industry_id: null } : null
    const denied = { ok: false, message: 'Knowledge entry not found.' }

    await expect(EditKnowledgeEntryPage({ params: params() })).rejects.toBe(notFoundError)
    await expect(updateEntry('entry-1', validInput)).resolves.toEqual(denied)
    await expect(deleteEntry('entry-1')).resolves.toEqual(denied)

    expect(selectSingleMock.mock.calls).toEqual(Array.from({ length: 3 }, () => [{ id: 'entry-1', scope: 'industry' }]))
    expect(embedMock).not.toHaveBeenCalled()
    expect(lastUpdatePayload).toBeNull()
    expect(updateEqMock).not.toHaveBeenCalled()
    expect(deleteEqMock).not.toHaveBeenCalled()
    expect(logAdminActionMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('stops before embedding and mutations when the scoped lookup errors', async () => {
    const error = { message: 'Industry lookup unavailable' }
    selectSingleMock.mockResolvedValueOnce({ data: null, error }).mockResolvedValueOnce({ data: null, error })

    await expect(updateEntry('entry-1', validInput)).resolves.toEqual({ ok: false, message: error.message })
    await expect(deleteEntry('entry-1')).resolves.toEqual({ ok: false, message: error.message })
    expect(embedMock).not.toHaveBeenCalled()
    expect(updateEqMock).not.toHaveBeenCalled()
    expect(deleteEqMock).not.toHaveBeenCalled()
    expect(logAdminActionMock).not.toHaveBeenCalled()
  })

  it.each(['update', 'delete'])('returns a miss without audit when scope changes before %s', async operation => {
    entry = { ...industryEntry, title: validInput.title, body: validInput.body }
    selectSingleMock.mockImplementationOnce(async filters => {
      const data = matchingEntry(filters)
      entry = { ...industryEntry, scope: 'company', industry_id: null }
      return { data, error: null }
    })

    const result = operation === 'update' ? await updateEntry('entry-1', validInput) : await deleteEntry('entry-1')

    expect(result).toEqual({ ok: false, message: 'Knowledge entry not found.' })
    expect(operation === 'update' ? updateEqMock : deleteEqMock)
      .toHaveBeenCalledExactlyOnceWith({ id: 'entry-1', scope: 'industry' })
    expect(embedMock).not.toHaveBeenCalled()
    expect(logAdminActionMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
