// @vitest-environment node
/**
 * Phase 188 Plan 04 (PROV-02) deviation: this suite exercises the real
 * analyze-photos worker, which now resolves its photo download via
 * serverStorage(supabase) -> assertServer() (Phase 188 fix — the census
 * gate found analyze-photos.ts using a raw supabase.storage.from(...) call
 * that Plans 01-03 had missed). assertServer() throws whenever
 * `typeof window !== 'undefined'`, which is always true under the suite's
 * default jsdom environment regardless of mocking. The `node` override here
 * matches the fix already applied across Plans 01-03's own test files for
 * the identical root cause.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 168 (PHOTO-02/03) — analyze-photos full coverage + chunking +
 * skip-and-continue.
 *
 * v4.19 audit E1: `load-photos` was `.order('sort_order').limit(20)` — photos
 * 21+ were unreachable by ANY number of dispatches. This suite locks the fix:
 * a null-filtered full load (company+project scoped, audit-verified
 * cross-tenant guard preserved), processed in chunks of 10 via
 * Promise.allSettled, with each `vision-${photoId}` step a DIRECT child of the
 * handler (never nested inside a chunk step.run).
 *
 * v4.19 audit E3 (PHOTO-03): `Promise.all` rejected on the FIRST failed
 * photo, failing the whole batch (generate never dispatched; already-
 * persisted descriptions lingered unmetered). The PHOTO-03 suite below locks
 * skip-and-continue: partial failure persists survivors, dispatches
 * generate, and meters record-usage/record-credit-debit for the succeeded
 * count; only a TOTAL failure (zero successes) still throws (onFailure/
 * notify semantics preserved).
 */

const mockAnalyzePhotoOR = vi.fn()
const mockRecordUsage = vi.fn().mockResolvedValue(undefined)
const mockRecordCreditDebit = vi.fn().mockResolvedValue(undefined)
const mockCheckCredits = vi.fn().mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })
const mockRecordPipelineEvent = vi.fn().mockResolvedValue(undefined)
const mockNotify = vi.fn().mockResolvedValue(undefined)
const mockNotifyOps = vi.fn().mockResolvedValue(undefined)
const mockBuildNotificationCopy = vi.fn((..._args: unknown[]) => ({ title: 't', body: 'b' }))
const mockInngestSend = vi.fn().mockResolvedValue({ ids: ['evt_test'] })

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: (opts: unknown, handler: unknown) => ({ opts, handler }),
    send: (...args: unknown[]) => mockInngestSend(...args),
  },
}))
vi.mock('@/lib/ai/openrouter-client', () => ({
  analyzePhotoOR: (...args: unknown[]) => mockAnalyzePhotoOR(...args),
}))
vi.mock('@/lib/quota', () => ({
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
}))
vi.mock('@/lib/billing/credit-ledger', () => ({
  recordCreditDebit: (...args: unknown[]) => mockRecordCreditDebit(...args),
  checkCredits: (...args: unknown[]) => mockCheckCredits(...args),
}))
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
}))
vi.mock('@/lib/notifications/copy', () => ({
  buildNotificationCopy: (...args: unknown[]) => mockBuildNotificationCopy(...args),
}))
vi.mock('@/lib/observability/pipeline-events', () => ({
  recordPipelineEvent: (...args: unknown[]) => mockRecordPipelineEvent(...args),
}))
vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: (...args: unknown[]) => mockNotifyOps(...args),
}))

type PhotoRow = { id: string; storage_path: string }
type QueryCall = { method: string; args: unknown[] }

const state: {
  photos: PhotoRow[]
  photoQueryCalls: QueryCall[]
  updateCalls: Array<{ photoId: string; patch: Record<string, unknown> }>
  aiCostRows: Array<{ real_cost_usd: number | null }>
  downloadShouldFail: Set<string>
} = {
  photos: [],
  photoQueryCalls: [],
  updateCalls: [],
  aiCostRows: [{ real_cost_usd: 0.01 }],
  downloadShouldFail: new Set(),
}

function makeSvc() {
  return {
    from: (table: string) => {
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { user_id: 'user-1' } }) }),
          }),
        }
      }
      if (table === 'photos') {
        return {
          select: (...selectArgs: unknown[]) => {
            state.photoQueryCalls.push({ method: 'select', args: selectArgs })
            const chain: Record<string, unknown> = {}
            const record =
              (method: string) =>
              (...args: unknown[]) => {
                state.photoQueryCalls.push({ method, args })
                return chain
              }
            chain.eq = record('eq')
            chain.order = record('order')
            chain.is = record('is')
            chain.limit = record('limit')
            chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve({ data: state.photos }).then(resolve, reject)
            return chain
          },
          update: (patch: Record<string, unknown>) => ({
            eq: async (_col: string, photoId: string) => {
              state.updateCalls.push({ photoId, patch })
              return { error: null }
            },
          }),
        }
      }
      if (table === 'ai_cost_events') {
        return {
          select: () => ({
            eq: async () => ({ data: state.aiCostRows }),
          }),
        }
      }
      return { insert: async () => ({ error: null }) }
    },
    storage: {
      from: () => ({
        download: async (path: string) => {
          if (state.downloadShouldFail.has(path)) {
            return { data: null, error: { message: 'storage miss' } }
          }
          return { data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null }
        },
      }),
    },
  }
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => makeSvc(),
}))

const fakeStep = { run: async (_id: string, fn: () => unknown) => fn() }

function makePhotos(count: number): PhotoRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `photo-${i}`,
    storage_path: `company-1/project-1/photo-${i}.jpg`,
  }))
}

async function invokeJob(overrides?: {
  autoGenerateEstimate?: boolean
  companyId?: string
  projectId?: string
}) {
  const { analyzePhotosJob } = await import('@/lib/inngest/functions/analyze-photos')
  const fn = analyzePhotosJob as unknown as {
    handler: (args: {
      event: unknown
      step: typeof fakeStep
    }) => Promise<{ results: Array<{ photoId: string; description: string }> }>
  }
  return fn.handler({
    event: {
      data: {
        companyId: overrides?.companyId ?? 'company-1',
        projectId: overrides?.projectId ?? 'project-1',
        requestId: 'req-1',
        attemptId: 'attempt-1',
        ...(overrides?.autoGenerateEstimate ? { autoGenerateEstimate: true } : {}),
      },
    },
    step: fakeStep,
  })
}

function succeededMetadataFromLastEvent() {
  const call = mockRecordPipelineEvent.mock.calls.find(
    (c) => (c[0] as { status?: string }).status === 'succeeded'
  )?.[0] as
    | { metadata?: { analyzedCount: number; totalCount: number; failedCount: number } }
    | undefined
  return call?.metadata
}

describe('PHOTO-02: full coverage + chunking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.photos = []
    state.photoQueryCalls = []
    state.updateCalls = []
    state.aiCostRows = [{ real_cost_usd: 0.01 }]
    state.downloadShouldFail = new Set()
    mockAnalyzePhotoOR.mockImplementation(async (base64: string) => `description for ${base64}`)
    mockCheckCredits.mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })
  })

  it('a 35-photo project gets ALL 35 analyzed across chunks (the first-20 cutoff is gone)', async () => {
    state.photos = makePhotos(35)

    const result = await invokeJob()

    expect(mockAnalyzePhotoOR).toHaveBeenCalledTimes(35)
    expect(state.updateCalls).toHaveLength(35)
    expect(result.results).toHaveLength(35)
    expect(succeededMetadataFromLastEvent()).toEqual({
      analyzedCount: 35,
      totalCount: 35,
      failedCount: 0,
    })
  })

  it('load-photos filters `.is(\'ai_description\', null)` — NOT `.limit(...)` — so a re-dispatch only processes the remainder', async () => {
    // Simulates: 20 photos already analyzed (filtered out at the DB level by
    // the null check), 15 remain — the mock's `state.photos` stands in for
    // what the (mocked) query already returned post-filter.
    state.photos = makePhotos(15)

    await invokeJob()

    expect(mockAnalyzePhotoOR).toHaveBeenCalledTimes(15)
    const isCall = state.photoQueryCalls.find((c) => c.method === 'is')
    expect(isCall?.args).toEqual(['ai_description', null])
    const limitCall = state.photoQueryCalls.find((c) => c.method === 'limit')
    expect(limitCall).toBeUndefined()
  })

  it('load-photos scoping stays company+project bound (cross-tenant guard preserved)', async () => {
    state.photos = makePhotos(3)

    await invokeJob({ companyId: 'company-9', projectId: 'project-9' })

    const eqCalls = state.photoQueryCalls.filter((c) => c.method === 'eq')
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['project_id', 'project-9'] })
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['company_id', 'company-9'] })
  })
})

describe('PHOTO-03: skip-and-continue failure policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.photos = []
    state.photoQueryCalls = []
    state.updateCalls = []
    state.aiCostRows = [{ real_cost_usd: 0.01 }]
    state.downloadShouldFail = new Set()
    mockCheckCredits.mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })
  })

  it('1-of-5 fails: 4 descriptions persist, generate dispatches, usage/debit run with units=4, failedCount=1', async () => {
    state.photos = makePhotos(5)
    // photo-3's DOWNLOAD fails — a per-photo vision-step failure.
    state.downloadShouldFail = new Set(['company-1/project-1/photo-3.jpg'])
    mockAnalyzePhotoOR.mockImplementation(async () => 'a description')

    const result = await invokeJob({ autoGenerateEstimate: true })

    expect(result.results).toHaveLength(4)
    expect(state.updateCalls).toHaveLength(4)
    expect(state.updateCalls.find((u) => u.photoId === 'photo-3')).toBeUndefined()

    expect(mockInngestSend).toHaveBeenCalledOnce()
    const sendArgs = mockInngestSend.mock.calls[0][0] as { name: string }
    expect(sendArgs.name).toBe('estimate/generate.requested')

    expect(mockRecordUsage).toHaveBeenCalledOnce()
    const usageArgs = mockRecordUsage.mock.calls[0]
    expect(usageArgs[3]).toBe(4) // units = succeeded count, NOT photos.length
    expect(mockRecordCreditDebit).toHaveBeenCalledOnce()

    expect(succeededMetadataFromLastEvent()).toEqual({
      analyzedCount: 4,
      totalCount: 5,
      failedCount: 1,
    })
  })

  it('5-of-5 fail: job throws (zero successes) — onFailure/notify semantics preserved', async () => {
    state.photos = makePhotos(5)
    state.downloadShouldFail = new Set(state.photos.map((p) => p.storage_path))

    await expect(invokeJob()).rejects.toThrow(/Photo analysis failed/)

    expect(state.updateCalls).toHaveLength(0)
    expect(mockRecordUsage).not.toHaveBeenCalled()
    expect(mockRecordCreditDebit).not.toHaveBeenCalled()
    // Total failure never reaches the succeeded terminal event.
    expect(succeededMetadataFromLastEvent()).toBeUndefined()
  })

  it('one bad photo does not block the others from persisting even mid-chunk', async () => {
    state.photos = makePhotos(3)
    state.downloadShouldFail = new Set(['company-1/project-1/photo-1.jpg'])
    mockAnalyzePhotoOR.mockImplementation(async () => 'a description')

    const result = await invokeJob()

    expect(result.results).toHaveLength(2)
    expect(state.updateCalls.map((u) => u.photoId).sort()).toEqual(['photo-0', 'photo-2'])
  })

  it('zero photos to process (fully re-dispatched, nothing left) — no throw, no metering, terminal event records 0/0/0', async () => {
    state.photos = []

    const result = await invokeJob()

    expect(result.results).toHaveLength(0)
    expect(mockRecordUsage).not.toHaveBeenCalled()
    expect(mockRecordCreditDebit).not.toHaveBeenCalled()
    expect(succeededMetadataFromLastEvent()).toEqual({
      analyzedCount: 0,
      totalCount: 0,
      failedCount: 0,
    })
  })
})
