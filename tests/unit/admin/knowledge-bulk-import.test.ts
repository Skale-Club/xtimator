import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * KCUR-03: bulkImportEntries(industryId, rows) server action — the super-admin
 * industry KB bulk-import data path.
 *
 * Invariants under test (mocked requireAdmin + requireServiceClient + embedMany +
 * isKnownIndustry + audit-log + next/cache — ZERO live network/DB):
 *   1. requireAdmin() FIRST; embedMany called ONCE with all valid texts; a SINGLE
 *      bulk .insert of rows each scope='industry', industry_id=chosen,
 *      company_id=null, embedding set.
 *   2. Server re-validate: a row with empty body is dropped (only valid rows
 *      inserted).
 *   3. 0 valid rows → { ok:false }, .insert NOT called.
 *   4. embedMany throws → { ok:false }, .insert NOT called (no partial import —
 *      Pitfall 4: batch-embed failure aborts the whole import).
 *   5. Unknown industryId → { ok:false }, neither embedMany nor .insert called.
 */

// ---- mocks -----------------------------------------------------------------
const requireAdminMock = vi.fn(async () => ({ userId: 'admin-1', email: 'a@x.com' }))
vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: () => requireAdminMock(),
}))

const insertMock = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}))

let lastInsertPayload: Array<Record<string, unknown>> | null = null

const fromMock = vi.fn((_table: string) => ({
  insert: (payload: Array<Record<string, unknown>>) => {
    lastInsertPayload = payload
    return insertMock()
  },
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: fromMock }),
}))

const embedManyMock = vi.fn(async (texts: string[]) =>
  texts.map(() => Array.from({ length: 1536 }, () => 0.001))
)
vi.mock('@/lib/knowledge/embed', () => ({
  // embed() also exported from this module — keep it present for the action file's imports.
  embed: vi.fn(async () => Array.from({ length: 1536 }, () => 0.001)),
  embedMany: (texts: string[]) => embedManyMock(texts),
}))

const isKnownIndustryMock = vi.fn((_id: string) => true)
vi.mock('@/lib/industries', () => ({
  isKnownIndustry: (id: string) => isKnownIndustryMock(id),
}))

const logAdminActionMock = vi.fn(async (_params: { action?: string }) => undefined)
vi.mock('@/lib/admin/audit-log', () => ({
  logAdminAction: (params: { action?: string }) => logAdminActionMock(params),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Validation schema (createEntry/updateEntry use it) — not exercised by bulk
// import, but the action module imports it at load time.
vi.mock('@/lib/schemas/knowledge', () => ({
  knowledgeEntrySchema: { safeParse: () => ({ success: true, data: {} }) },
}))

// ---- import under test (after mocks) ---------------------------------------
import { bulkImportEntries } from '@/app/admin/knowledge/actions'

const INDUSTRY = 'house_cleaning'

const threeRows = [
  { title: 'Pet odor', body: 'Apply enzymatic cleaner', source: 'ICAN' },
  { title: 'Grout sealing', body: 'Seal grout 24h after install', source: null },
  { title: 'Window streaks', body: 'Use a squeegee at an angle', source: 'Manual' },
]

beforeEach(() => {
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 'admin-1', email: 'a@x.com' })
  insertMock.mockClear()
  insertMock.mockResolvedValue({ error: null })
  fromMock.mockClear()
  embedManyMock.mockClear()
  embedManyMock.mockImplementation(async (texts: string[]) =>
    texts.map(() => Array.from({ length: 1536 }, () => 0.001))
  )
  isKnownIndustryMock.mockClear()
  isKnownIndustryMock.mockReturnValue(true)
  logAdminActionMock.mockClear()
  lastInsertPayload = null
})

describe('bulkImportEntries (KCUR-03)', () => {
  it('1. batch-embeds all valid rows then bulk-inserts as industry rows', async () => {
    const res = await bulkImportEntries(INDUSTRY, threeRows)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.imported).toBe(3)

    // requireAdmin gate ran before the write.
    expect(requireAdminMock).toHaveBeenCalledTimes(1)
    // embedMany called once with 3 texts (title + body joined).
    expect(embedManyMock).toHaveBeenCalledTimes(1)
    const texts = embedManyMock.mock.calls[0]?.[0] as string[]
    expect(texts).toHaveLength(3)
    expect(texts[0]).toBe('Pet odor\n\nApply enzymatic cleaner')

    // a SINGLE bulk insert with 3 rows.
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(lastInsertPayload).toHaveLength(3)
    for (const row of lastInsertPayload ?? []) {
      expect(row.scope).toBe('industry')
      expect(row.industry_id).toBe(INDUSTRY)
      expect(row.company_id).toBeNull()
      const emb = row.embedding
      const vec = typeof emb === 'string' ? (JSON.parse(emb) as number[]) : (emb as number[])
      expect(vec).toHaveLength(1536)
    }

    expect(logAdminActionMock).toHaveBeenCalledTimes(1)
  })

  it('2. server re-validate drops a row with empty body (only valid rows inserted)', async () => {
    const rows = [
      { title: 'Pet odor', body: 'Apply enzymatic cleaner', source: 'ICAN' },
      { title: 'Bad row', body: '   ', source: null },
      { title: 'Grout sealing', body: 'Seal grout 24h', source: null },
    ]
    const res = await bulkImportEntries(INDUSTRY, rows)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.imported).toBe(2)
    expect(embedManyMock.mock.calls[0]?.[0]).toHaveLength(2)
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(lastInsertPayload).toHaveLength(2)
  })

  it('3. 0 valid rows → ok:false, no embed, no insert', async () => {
    const rows = [
      { title: '', body: 'orphan body', source: null },
      { title: 'orphan title', body: '   ', source: null },
    ]
    const res = await bulkImportEntries(INDUSTRY, rows)
    expect(res.ok).toBe(false)
    expect(embedManyMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('4. embedMany throws → ok:false and NO insert (no partial import)', async () => {
    embedManyMock.mockRejectedValueOnce(new Error('embeddings 500'))
    const res = await bulkImportEntries(INDUSTRY, threeRows)
    expect(res.ok).toBe(false)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('5. unknown industryId → ok:false, neither embedMany nor insert called', async () => {
    isKnownIndustryMock.mockReturnValueOnce(false)
    const res = await bulkImportEntries('not_a_trade', threeRows)
    expect(res.ok).toBe(false)
    expect(embedManyMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('6. non-admin rejected before any work', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(bulkImportEntries(INDUSTRY, threeRows)).rejects.toThrow()
    expect(embedManyMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })
})
