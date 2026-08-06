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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Phase 167 (BILL-03, audit D4) — vision cost roll-up is no longer dead code.
 *
 * `analyzePhotoOR` has ALWAYS accepted an optional 4th `costContext` param
 * (lib/ai/openrouter-client.ts) and recorded the vision cost row with
 * `attemptId: costContext?.attemptId ?? randomUUID()` + null company/project
 * when absent. But the analyze-photos worker called it WITHOUT costContext,
 * so every vision `ai_cost_events` row got a random attemptId + null ids, and
 * the `record-credit-debit` step's read-back (`.eq('attempt_id', attemptId)`)
 * matched zero rows — permanently recording a null cost for `photo_batch`
 * debits.
 *
 * This suite runs the REAL `analyzePhotoOR` (only `fetch`, `recordAICost`,
 * `getIntegrationKey`, and `langfuseClient` are mocked) so the worker test
 * exercises the actual call-site fix end-to-end, and locks:
 *
 *  1. The worker's per-photo call threads `{ attemptId, companyId,
 *     projectId }` from the job payload into `analyzePhotoOR`, which writes
 *     it straight through to `recordAICost` (never a random uuid / null ids).
 *  2. The PRE-EXISTING record-credit-debit read-back sums a non-null
 *     `realCostUsd` for a 2-photo batch — the exact dead-code path the audit
 *     flagged, now alive. (The read-back itself is untouched — this proves
 *     it already works once rows carry the right attemptId.)
 *  3. N photos in one batch legitimately share ONE attemptId across N
 *     `vision`-typed cost rows.
 *  4. The 167-01 partial unique index (`ai_cost_events_attempt_op_unique`)
 *     is scoped to `('audio_minutes', 'estimate')` only — `vision`/
 *     `photo_batch` stay outside its predicate, so those shared-attemptId
 *     rows are never rejected by it.
 */

const mockRecordUsage = vi.fn().mockResolvedValue(undefined)
const mockRecordCreditDebit = vi.fn().mockResolvedValue(undefined)
const mockCheckCredits = vi.fn().mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })
const mockRecordPipelineEvent = vi.fn().mockResolvedValue(undefined)
const mockNotify = vi.fn().mockResolvedValue(undefined)
const mockNotifyOps = vi.fn().mockResolvedValue(undefined)
const mockBuildNotificationCopy = vi.fn((..._args: unknown[]) => ({ title: 't', body: 'b' }))
const mockInngestSend = vi.fn().mockResolvedValue({ ids: ['evt_test'] })
const mockRecordAICost = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: (opts: unknown, handler: unknown) => ({ opts, handler }),
    send: (...args: unknown[]) => mockInngestSend(...args),
  },
}))
// analyzePhotoOR is the REAL implementation — only its own dependencies
// (fetch, recordAICost, key lookup, langfuse) are mocked, so this suite
// exercises the ACTUAL costContext plumbing end-to-end rather than a stub.
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(async () => 'or-key-placeholder'),
}))
vi.mock('@/lib/observability/langfuse', () => ({
  langfuseClient: {
    generation: () => ({ end: () => {} }),
    flushAsync: async () => {},
  },
}))
vi.mock('@/lib/billing/record-ai-cost', () => ({
  recordAICost: (...args: unknown[]) => mockRecordAICost(...args),
}))
vi.mock('@/lib/ai/providers/gemini', () => ({
  analyzePhotoGemini: vi.fn(async () => 'gemini fallback description'),
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
  aiCostRows: Array<{ real_cost_usd: number | null }>
  aiCostEqCalls: Array<{ col: string; value: unknown }>
} = {
  photos: [],
  aiCostRows: [],
  aiCostEqCalls: [],
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
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }
      if (table === 'ai_cost_events') {
        return {
          select: () => ({
            eq: async (col: string, value: unknown) => {
              state.aiCostEqCalls.push({ col, value })
              return { data: state.aiCostRows }
            },
          }),
        }
      }
      return { insert: async () => ({ error: null }) }
    },
    storage: {
      from: () => ({
        download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null }),
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

function mockVisionResponse(content: string, cost: number | undefined) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      ...(cost === undefined ? {} : { usage: { cost } }),
    }),
  }
}

async function invokeJob(overrides?: {
  companyId?: string
  projectId?: string
  attemptId?: string
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
        attemptId: overrides?.attemptId ?? 'attempt-1',
      },
    },
    step: fakeStep,
  })
}

describe('BILL-03: analyze-photos worker threads costContext into the (real) vision call', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.photos = []
    state.aiCostRows = []
    state.aiCostEqCalls = []
    mockCheckCredits.mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('recordAICost receives the JOB attemptId + real company/project ids for every photo — not a random uuid / null', async () => {
    state.photos = makePhotos(3)
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockVisionResponse('a description', 0.002)
    )

    await invokeJob({ companyId: 'company-42', projectId: 'project-99', attemptId: 'attempt-777' })

    expect(mockRecordAICost).toHaveBeenCalledTimes(3)
    for (const call of mockRecordAICost.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          attemptId: 'attempt-777',
          companyId: 'company-42',
          projectId: 'project-99',
          operationType: 'vision',
          realCostUsd: 0.002,
        })
      )
    }
  })

  it('falls back to a server-generated attemptId (never undefined) when the job payload omits one, and still threads company/project', async () => {
    state.photos = makePhotos(1)
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockVisionResponse('a description', 0.002)
    )
    const { analyzePhotosJob } = await import('@/lib/inngest/functions/analyze-photos')
    const fn = analyzePhotosJob as unknown as {
      handler: (args: { event: unknown; step: typeof fakeStep }) => Promise<unknown>
    }
    await fn.handler({
      event: { data: { companyId: 'company-1', projectId: 'project-1', requestId: 'req-1' } },
      step: fakeStep,
    })

    expect(mockRecordAICost).toHaveBeenCalledTimes(1)
    const arg = mockRecordAICost.mock.calls[0][0] as { attemptId?: string }
    expect(arg.attemptId).toEqual(expect.any(String))
    expect(arg.attemptId).not.toBe('')
  })

  it('N photos in one batch share ONE attemptId across N `vision` rows (no per-photo collision)', async () => {
    state.photos = makePhotos(4)
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockVisionResponse('a description', 0.001)
    )

    await invokeJob({ attemptId: 'batch-attempt-shared' })

    expect(mockRecordAICost).toHaveBeenCalledTimes(4)
    const calls = mockRecordAICost.mock.calls.map(
      (c) => c[0] as { attemptId: string; operationType: string }
    )
    expect(calls.every((c) => c.attemptId === 'batch-attempt-shared')).toBe(true)
    expect(calls.every((c) => c.operationType === 'vision')).toBe(true)
  })

  it('the record-credit-debit read-back sums a non-null realCostUsd for a 2-photo batch (previously permanently null)', async () => {
    state.photos = makePhotos(2)
    // Stands in for the DB state AFTER the fix: both per-photo vision rows
    // (just proven above to carry the job attemptId) are now findable by the
    // UNTOUCHED read-back's `.eq('attempt_id', attemptId)`.
    state.aiCostRows = [{ real_cost_usd: 0.5 }, { real_cost_usd: 1.5 }]
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockVisionResponse('a description', 0.5)
    )

    await invokeJob({ attemptId: 'attempt-batch-2' })

    expect(mockRecordCreditDebit).toHaveBeenCalledOnce()
    expect(mockRecordCreditDebit).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'photo_batch',
        realCostUsd: 2, // 0.5 + 1.5 — no longer permanently null
        attemptId: 'attempt-batch-2',
      })
    )
    // The read-back queries by the SAME attemptId the vision calls used.
    expect(state.aiCostEqCalls[0]).toEqual({ col: 'attempt_id', value: 'attempt-batch-2' })
  })

  it('a fully-null cost read (provider gave no cost data) still records null — never coerced to 0', async () => {
    state.photos = makePhotos(2)
    state.aiCostRows = [{ real_cost_usd: null }, { real_cost_usd: null }]
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockVisionResponse('a description', undefined)
    )

    await invokeJob({ attemptId: 'attempt-batch-null' })

    expect(mockRecordCreditDebit).toHaveBeenCalledWith(
      expect.objectContaining({ operationType: 'photo_batch', realCostUsd: null })
    )
  })
})

describe('BILL-03: 167-01 partial unique index leaves vision rows unconstrained (static contract)', () => {
  const MIGRATION_PATH = resolve(
    process.cwd(),
    'supabase/migrations/20260717000002_phase167_ai_cost_events_dedup.sql'
  )

  it('scopes the unique index to (attempt_id, operation_type) WHERE operation_type IN (audio_minutes, estimate) only', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8')
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS ai_cost_events_attempt_op_unique[\s\S]*ON public\.ai_cost_events \(attempt_id, operation_type\)[\s\S]*WHERE operation_type IN \('audio_minutes', 'estimate'\)/
    )
    // Explicitly does NOT include 'vision' or 'photo_batch' in the predicate —
    // the shared-attemptId rows proven above are never rejected by it.
    const whereClauseMatch = sql.match(/WHERE operation_type IN \(([^)]+)\)/)
    expect(whereClauseMatch).not.toBeNull()
    const predicateValues = whereClauseMatch![1]
    expect(predicateValues).not.toContain('vision')
    expect(predicateValues).not.toContain('photo_batch')
  })
})
