// @vitest-environment node
/**
 * 260821 — billing double-debit fix (generate-estimate.ts).
 *
 * Locks two regressions found live in prod:
 *
 *  1. HIGH (double-debit): `record-credit-debit`'s read-back from
 *     `ai_cost_events` was filtered ONLY by `attempt_id`. Since transcribe-audio
 *     and analyze-photos forward the SAME attemptId into the chained generate
 *     event (and both already recorded + debited their own 'audio_minutes' /
 *     'vision' cost rows under it), the unfiltered read-back summed those rows
 *     back into the 'estimate' debit — the estimate got debited for the
 *     audio/photo cost a second time. The fix scopes the read-back to
 *     `.eq('operation_type', 'estimate')`.
 *
 *  2. HIGH (attemptId not memoized): `const attemptId = data.attemptId ??
 *     randomUUID()` used to sit OUTSIDE the memoized `generation-start`
 *     step.run, so an Inngest retry (which re-executes the handler body from
 *     the top) minted a FRESH random id whenever the producer omitted
 *     attemptId — the read-back then found zero rows and the debit was
 *     silently skipped. The fix moves the fallback inside the memoized step.
 *
 * This suite runs the REAL generate-estimate handler (only its module-level
 * dependencies are mocked) with a step.run fake that mimics Inngest's actual
 * memoization contract: a step id already in the cache returns its cached
 * result WITHOUT re-invoking the factory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRecordUsage = vi.fn().mockResolvedValue(undefined)
const mockNotifyQuotaThresholds = vi.fn().mockResolvedValue(undefined)
const mockRecordCreditDebit = vi.fn().mockResolvedValue(undefined)
const mockGetEntitlementsForTier = vi.fn().mockResolvedValue({ maxEstimatesPerMonth: null })
const mockRecordPipelineEvent = vi.fn().mockResolvedValue(undefined)
const mockNotify = vi.fn().mockResolvedValue(undefined)
const mockNotifyOps = vi.fn().mockResolvedValue(undefined)
const mockBuildNotificationCopy = vi.fn((..._args: unknown[]) => ({ title: 't', body: 'b' }))
const mockGraphInvoke = vi.fn().mockResolvedValue({ estimateId: 'est-1' })

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: (opts: unknown, handler: unknown) => ({ opts, handler }),
  },
}))
vi.mock('@/lib/demo/guard', () => ({
  assertCompanyWritable: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/estimate/adapters/default', () => ({
  makeDefaultAdapter: vi.fn().mockReturnValue({
    channel: 'web',
    ingest: vi.fn().mockResolvedValue({}),
    finalize: vi.fn().mockResolvedValue({}),
    onError: vi.fn().mockRejectedValue(new Error('generation_failed')),
  }),
}))
vi.mock('@/lib/estimate/graph', () => ({
  buildEstimateGraph: vi.fn().mockReturnValue({
    invoke: (...args: unknown[]) => mockGraphInvoke(...args),
  }),
}))
vi.mock('@/lib/quota', () => ({
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
  notifyQuotaThresholds: (...args: unknown[]) => mockNotifyQuotaThresholds(...args),
}))
vi.mock('@/lib/entitlements-server', () => ({
  getEntitlementsForTier: (...args: unknown[]) => mockGetEntitlementsForTier(...args),
}))
vi.mock('@/lib/billing/credit-ledger', () => ({
  recordCreditDebit: (...args: unknown[]) => mockRecordCreditDebit(...args),
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
// The 'orchestrate-estimate' step constructs a Langfuse CallbackHandler and
// flushes langfuseProcessor directly (not through the mocked graph) — stub
// both so the real handler body can run without a network call.
vi.mock('@langfuse/langchain', () => ({
  CallbackHandler: class {
    constructor(..._args: unknown[]) {}
  },
}))
vi.mock('@/instrumentation', () => ({
  langfuseProcessor: null,
}))

type AiCostRow = { real_cost_usd: number | null }
type EqCall = { col: string; value: unknown }

const state: {
  aiCostRows: AiCostRow[]
  aiCostEqCalls: EqCall[]
} = { aiCostRows: [], aiCostEqCalls: [] }

function makeSvc() {
  return {
    from: (table: string) => {
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { user_id: 'user-1', tier: 'free' } }),
            }),
          }),
        }
      }
      if (table === 'ai_cost_events') {
        return {
          select: () => {
            const chain = {
              eq: (col: string, value: unknown) => {
                state.aiCostEqCalls.push({ col, value })
                return chain
              },
              then: (
                resolve: (v: { data: AiCostRow[] }) => unknown,
                reject?: (e: unknown) => unknown
              ) => Promise.resolve({ data: state.aiCostRows }).then(resolve, reject),
            }
            return chain
          },
        }
      }
      return { insert: async () => ({ error: null }) }
    },
  }
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => makeSvc(),
}))

/** Mimics Inngest's real step.run memoization: a cached step id returns its
 * cached result WITHOUT re-invoking the factory — exactly what makes a
 * memoized attemptId (or t0) stable across a retry/replay leg. */
function makeReplayStep(cache: Map<string, unknown>) {
  return {
    run: async (id: string, fn: () => unknown) => {
      if (cache.has(id)) return cache.get(id)
      const result = await fn()
      cache.set(id, result)
      return result
    },
  }
}

async function loadHandler() {
  const { generateEstimateJob } = await import('@/lib/inngest/functions/generate-estimate')
  return generateEstimateJob as unknown as {
    handler: (args: { event: unknown; step: ReturnType<typeof makeReplayStep> }) => Promise<unknown>
  }
}

function baseEvent(overrides?: { attemptId?: string }) {
  return {
    data: {
      companyId: 'company-1',
      projectId: 'project-1',
      requestId: 'req-1',
      ...(overrides?.attemptId ? { attemptId: overrides.attemptId } : {}),
    },
  }
}

describe('260821: generate-estimate record-credit-debit read-back scopes to operation_type=estimate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.aiCostRows = []
    state.aiCostEqCalls = []
    mockGetEntitlementsForTier.mockResolvedValue({ maxEstimatesPerMonth: null })
    mockGraphInvoke.mockResolvedValue({ estimateId: 'est-1' })
  })

  it('reads back filtered by attempt_id AND operation_type=estimate — never audio/photo ops', async () => {
    // Stands in for the DB state a shared-attemptId run leaves behind: an
    // 'estimate' row (this seam's own) PLUS an 'audio_minutes' row already
    // recorded+debited by transcribe-audio under the SAME attemptId. The
    // fixed read-back must only see the 'estimate' row.
    state.aiCostRows = [{ real_cost_usd: 0.02 }]
    const fn = await loadHandler()
    const step = makeReplayStep(new Map())

    await fn.handler({ event: baseEvent({ attemptId: 'shared-attempt-1' }), step })

    expect(mockRecordCreditDebit).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'estimate',
        realCostUsd: 0.02,
        attemptId: 'shared-attempt-1',
      })
    )
    expect(state.aiCostEqCalls).toEqual([
      { col: 'attempt_id', value: 'shared-attempt-1' },
      { col: 'operation_type', value: 'estimate' },
    ])
  })

  it('excludes an audio_minutes/vision row sharing the attemptId — mock reflects operation_type-scoped rows only', async () => {
    // The svc mock always returns state.aiCostRows regardless of the eq()
    // filter values (it is not a real DB) — so this test locks the QUERY
    // SHAPE (the .eq('operation_type', 'estimate') call is actually made),
    // which is what makes a real Postgres filter exclude the other ops' rows.
    state.aiCostRows = [{ real_cost_usd: 5 }] // would be 5 + audio's cost if unfiltered in prod
    const fn = await loadHandler()
    const step = makeReplayStep(new Map())

    await fn.handler({ event: baseEvent({ attemptId: 'attempt-2' }), step })

    const opFilter = state.aiCostEqCalls.find((c) => c.col === 'operation_type')
    expect(opFilter).toEqual({ col: 'operation_type', value: 'estimate' })
  })
})

describe('260821: attemptId fallback is memoized inside generation-start (stable across a replay)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.aiCostRows = [{ real_cost_usd: 0.01 }]
    state.aiCostEqCalls = []
    mockGetEntitlementsForTier.mockResolvedValue({ maxEstimatesPerMonth: null })
    mockGraphInvoke.mockResolvedValue({ estimateId: 'est-1' })
  })

  it('a fallback (producer omitted attemptId) survives a retry unchanged — the SAME id is used both legs', async () => {
    const fn = await loadHandler()
    const cache = new Map<string, unknown>()
    const step = makeReplayStep(cache)

    // Leg 1: the whole run completes; 'generation-start' (and everything
    // else) gets memoized into the shared cache.
    await fn.handler({ event: baseEvent(), step })
    expect(mockRecordCreditDebit).toHaveBeenCalledTimes(1)
    const firstAttemptId = (mockRecordCreditDebit.mock.calls[0]![0] as { attemptId: string })
      .attemptId
    expect(firstAttemptId).toEqual(expect.any(String))
    expect(firstAttemptId.length).toBeGreaterThan(0)

    // Leg 2 simulates a genuine Inngest retry: only steps AFTER the run's
    // completion point are un-memoized (here we drop every step but
    // 'generation-start', which already succeeded and stays cached) — the
    // handler body re-executes from the top either way.
    mockRecordCreditDebit.mockClear()
    for (const id of ['orchestrate-estimate', 'record-usage', 'record-credit-debit']) {
      cache.delete(id)
    }
    await fn.handler({ event: baseEvent(), step })
    expect(mockRecordCreditDebit).toHaveBeenCalledTimes(1)
    const secondAttemptId = (mockRecordCreditDebit.mock.calls[0]![0] as { attemptId: string })
      .attemptId

    // The pre-fix bug: `data.attemptId ?? randomUUID()` sat OUTSIDE step.run,
    // so leg 2 minted a BRAND NEW id here, the read-back found zero rows for
    // it, and the debit silently no-op'd. Post-fix: same id both legs.
    expect(secondAttemptId).toBe(firstAttemptId)
  })

  it('a producer-supplied attemptId always wins over any fallback (unaffected by memoization)', async () => {
    const fn = await loadHandler()
    const step = makeReplayStep(new Map())

    await fn.handler({ event: baseEvent({ attemptId: 'producer-supplied-id' }), step })

    expect(mockRecordCreditDebit).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: 'producer-supplied-id' })
    )
  })
})
