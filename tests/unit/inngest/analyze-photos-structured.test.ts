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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 171 (171-02) — PEXT-01/03/05: the analyze-photos worker's structured
 * extraction ladder (structured-OR -> structured-Gemini -> prose).
 *
 * Locks:
 *  (a) structured-OR success -> both `ai_extraction` + `ai_description`
 *      persisted in ONE update, extraction validated, prose never called.
 *  (b) structured-OR fails, structured-Gemini succeeds -> persisted from the
 *      Gemini extraction.
 *  (c) both structured rungs fail -> the prose path persists `ai_description`
 *      ONLY (byte-identical to pre-171), photo still counts as SUCCEEDED.
 *  (d) `PHOTO_STRUCTURED_EXTRACTION=off` -> structured providers never
 *      called, behavior byte-identical to the pre-171 prose pipeline.
 *  (e) all rungs (structured + prose) fail for every photo -> the job throws
 *      (zero successes) — the 168-01 skip-and-continue policy is preserved
 *      THROUGH the ladder, not just around it.
 *  (f) costContext (attemptId/companyId/projectId) is threaded to every
 *      structured call, exactly like the existing prose call site (167-02).
 *
 * This suite runs ALONGSIDE (not instead of) analyze-photos-coverage.test.ts,
 * analyze-photos-job.test.ts, and analyze-photos-cost.test.ts, which stay
 * GREEN UNMODIFIED — they are the PEXT-03 regression proof that the ladder
 * degrades to the pre-171 pipeline exactly when structured extraction isn't
 * exercised or isn't mocked.
 */

const mockAnalyzePhotoOR = vi.fn()
const mockAnalyzePhotoStructuredOR = vi.fn()
const mockAnalyzePhotoGemini = vi.fn()
const mockAnalyzePhotoStructuredGemini = vi.fn()
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
  analyzePhotoStructuredOR: (...args: unknown[]) => mockAnalyzePhotoStructuredOR(...args),
}))
vi.mock('@/lib/ai/providers/gemini', () => ({
  analyzePhotoGemini: (...args: unknown[]) => mockAnalyzePhotoGemini(...args),
  analyzePhotoStructuredGemini: (...args: unknown[]) => mockAnalyzePhotoStructuredGemini(...args),
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

const state: {
  photos: PhotoRow[]
  updateCalls: Array<{ photoId: string; patch: Record<string, unknown> }>
  downloadShouldFail: Set<string>
} = { photos: [], updateCalls: [], downloadShouldFail: new Set() }

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
          select: () => {
            const chain: Record<string, unknown> = {}
            const record = () => () => chain
            chain.eq = record()
            chain.order = record()
            chain.is = record()
            chain.limit = record()
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
        return { select: () => ({ eq: async () => ({ data: [{ real_cost_usd: 0.01 }] }) }) }
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

async function invokeJob(overrides?: { companyId?: string; projectId?: string }) {
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
      },
    },
    step: fakeStep,
  })
}

const VALID_EXTRACTION = {
  version: 1,
  surfaces: [],
  measurements: [],
  materials: [],
  damage: [],
  trade_signals: [],
  access_notes: null,
  overall_description: 'A tidy kitchen with granite counters.',
}

describe('PEXT-01/03/05: analyze-photos structured extraction ladder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    state.photos = []
    state.updateCalls = []
    state.downloadShouldFail = new Set()
    mockCheckCredits.mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('(a) structured-OR success -> both columns persisted in ONE update, prose never called', async () => {
    state.photos = makePhotos(1)
    mockAnalyzePhotoStructuredOR.mockResolvedValue(VALID_EXTRACTION)

    const result = await invokeJob()

    expect(mockAnalyzePhotoStructuredOR).toHaveBeenCalledOnce()
    expect(mockAnalyzePhotoStructuredGemini).not.toHaveBeenCalled()
    expect(mockAnalyzePhotoOR).not.toHaveBeenCalled()
    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].patch).toEqual({
      ai_extraction: VALID_EXTRACTION,
      ai_description: VALID_EXTRACTION.overall_description,
    })
    expect(result.results[0].description).toBe(VALID_EXTRACTION.overall_description)
  })

  it('(b) structured-OR fails, structured-Gemini succeeds -> persisted from the Gemini extraction', async () => {
    state.photos = makePhotos(1)
    mockAnalyzePhotoStructuredOR.mockRejectedValue(new Error('OR structured down'))
    mockAnalyzePhotoStructuredGemini.mockResolvedValue(VALID_EXTRACTION)

    await invokeJob()

    expect(mockAnalyzePhotoStructuredOR).toHaveBeenCalledOnce()
    expect(mockAnalyzePhotoStructuredGemini).toHaveBeenCalledOnce()
    expect(mockAnalyzePhotoOR).not.toHaveBeenCalled()
    expect(state.updateCalls[0].patch).toEqual({
      ai_extraction: VALID_EXTRACTION,
      ai_description: VALID_EXTRACTION.overall_description,
    })
  })

  it('(c) both structured rungs fail -> prose path persists ai_description ONLY, photo still counts as succeeded', async () => {
    state.photos = makePhotos(1)
    mockAnalyzePhotoStructuredOR.mockRejectedValue(new Error('OR structured down'))
    mockAnalyzePhotoStructuredGemini.mockRejectedValue(new Error('Gemini structured down'))
    mockAnalyzePhotoOR.mockResolvedValue('a prose description')

    const result = await invokeJob()

    expect(mockAnalyzePhotoOR).toHaveBeenCalledOnce()
    expect(state.updateCalls[0].patch).toEqual({ ai_description: 'a prose description' })
    expect(result.results).toHaveLength(1)
    expect(result.results[0].description).toBe('a prose description')
  })

  it('(d) PHOTO_STRUCTURED_EXTRACTION=off -> structured providers never called, byte-identical to pre-171 prose', async () => {
    vi.stubEnv('PHOTO_STRUCTURED_EXTRACTION', 'off')
    state.photos = makePhotos(3)
    mockAnalyzePhotoOR.mockResolvedValue('a prose description')

    const result = await invokeJob()

    expect(mockAnalyzePhotoStructuredOR).not.toHaveBeenCalled()
    expect(mockAnalyzePhotoStructuredGemini).not.toHaveBeenCalled()
    expect(mockAnalyzePhotoOR).toHaveBeenCalledTimes(3)
    expect(state.updateCalls).toHaveLength(3)
    for (const call of state.updateCalls) {
      expect(call.patch).toEqual({ ai_description: 'a prose description' })
    }
    expect(result.results).toHaveLength(3)
  })

  it('(e) all rungs (structured + prose) fail for every photo -> job throws (skip-and-continue policy preserved)', async () => {
    state.photos = makePhotos(3)
    mockAnalyzePhotoStructuredOR.mockRejectedValue(new Error('OR structured down'))
    mockAnalyzePhotoStructuredGemini.mockRejectedValue(new Error('Gemini structured down'))
    mockAnalyzePhotoOR.mockRejectedValue(new Error('prose down too'))

    await expect(invokeJob()).rejects.toThrow(/Photo analysis failed/)
    expect(state.updateCalls).toHaveLength(0)
    expect(mockRecordUsage).not.toHaveBeenCalled()
    expect(mockRecordCreditDebit).not.toHaveBeenCalled()
  })

  it('(f) costContext (attemptId/companyId/projectId) is passed to every structured call', async () => {
    state.photos = makePhotos(1)
    mockAnalyzePhotoStructuredOR.mockRejectedValue(new Error('OR structured down'))
    mockAnalyzePhotoStructuredGemini.mockResolvedValue(VALID_EXTRACTION)

    await invokeJob({ companyId: 'company-9', projectId: 'project-9' })

    expect(mockAnalyzePhotoStructuredOR).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      undefined,
      expect.objectContaining({ attemptId: 'attempt-1', companyId: 'company-9', projectId: 'project-9' })
    )
    expect(mockAnalyzePhotoStructuredGemini).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ attemptId: 'attempt-1', companyId: 'company-9', projectId: 'project-9' })
    )
  })
})
