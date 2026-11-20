import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Credits plan 2026-11-20 - the generate-estimate job pauses for credits
 * before analyzing pending photos and before generating; an expired pause
 * stops the run without generating or debiting anything.
 */

const continueOrPause = vi.fn()
vi.mock('@/lib/inngest/credit-pause', () => ({
  continueOrPauseForCredits: (...a: unknown[]) => continueOrPause(...a),
}))
const mockGraphInvoke = vi.fn().mockResolvedValue({ estimateId: 'est-1' })
const mockRecordCreditDebit = vi.fn().mockResolvedValue(undefined)
const analyzePendingPhotos = vi.fn().mockResolvedValue({ pending: 2, analyzed: 2, failed: 0 })

vi.mock('@/lib/inngest/client', () => ({
  inngest: { createFunction: (opts: unknown, handler: unknown) => ({ opts, handler }), send: vi.fn() },
}))
vi.mock('@/lib/demo/guard', () => ({ assertCompanyWritable: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/estimate/adapters/default', () => ({ makeDefaultAdapter: () => ({}) }))
vi.mock('@/lib/estimate/graph', () => ({ buildEstimateGraph: () => ({ invoke: (...a: unknown[]) => mockGraphInvoke(...a) }) }))
vi.mock('@/lib/quota', () => ({ recordUsage: vi.fn(), notifyQuotaThresholds: vi.fn() }))
vi.mock('@/lib/entitlements-server', () => ({ getEntitlementsForTier: vi.fn().mockResolvedValue({ maxEstimatesPerMonth: null }) }))
vi.mock('@/lib/billing/credit-ledger', () => ({ recordCreditDebit: (...a: unknown[]) => mockRecordCreditDebit(...a) }))
vi.mock('@/lib/notifications/dispatch', () => ({ notify: vi.fn() }))
vi.mock('@/lib/notifications/copy', () => ({ buildNotificationCopy: () => ({ title: 't', body: 'b' }) }))
vi.mock('@/lib/notifications/estimate-push', () => ({ sendEstimatePush: vi.fn().mockResolvedValue({ sent: 0, removed: 0 }) }))
vi.mock('@/lib/observability/pipeline-events', () => ({ recordPipelineEvent: vi.fn() }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: vi.fn() }))
vi.mock('@/lib/estimate/photos/analyze-pending-photos', () => ({ analyzePendingPhotos: (...a: unknown[]) => analyzePendingPhotos(...a) }))
vi.mock('@/lib/services/persist-patched-estimate', () => ({ persistPatchedEstimate: vi.fn() }))
vi.mock('@langfuse/langchain', () => ({ CallbackHandler: class {} }))
vi.mock('@/instrumentation', () => ({ langfuseProcessor: null }))

let pendingCount = 0
function chain(result: unknown): unknown {
  const p = Promise.resolve(result)
  const proxy: unknown = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? p.then.bind(p) : () => proxy),
    apply: () => proxy,
  })
  return proxy
}
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: (table: string) =>
      table === 'photos' ? chain({ count: pendingCount }) : chain({ data: [], count: 0 }),
  }),
}))

function step() {
  return {
    ids: [] as string[],
    run: async function (id: string, fn: () => unknown) {
      this.ids.push(id)
      return fn()
    },
    waitForEvent: vi.fn(),
  }
}

const { generateEstimateJob } = await import('@/lib/inngest/functions/generate-estimate')
const job = generateEstimateJob as unknown as { handler: (a: { event: unknown; step: ReturnType<typeof step> }) => Promise<unknown> }
const event = { data: { companyId: 'co-1', projectId: 'p-1', requestId: 'r-1', attemptId: 'att-1', channel: 'web', inputType: 'recording' } }

beforeEach(() => {
  vi.clearAllMocks()
  pendingCount = 0
  continueOrPause.mockResolvedValue('continue')
})

describe('generate-estimate job and the credit pause', () => {
  it('with no pending photos it checks credits once, before generating', async () => {
    await job.handler({ event, step: step() })
    expect(continueOrPause).toHaveBeenCalledTimes(1)
    expect(continueOrPause.mock.calls[0][1]).toMatchObject({ next: 'generate_estimate', attemptId: 'att-1', projectId: 'p-1' })
    expect(mockGraphInvoke).toHaveBeenCalled()
  })

  it('with pending photos it checks before analyzing them AND before generating', async () => {
    pendingCount = 3
    await job.handler({ event, step: step() })
    expect(continueOrPause.mock.calls.map((c) => (c[1] as { next: string }).next)).toEqual(['analyze', 'generate_estimate'])
  })

  it('a pause that expires before the photos stops the run: no photo analysis, no generation, no debit', async () => {
    pendingCount = 2
    continueOrPause.mockResolvedValueOnce('expired')
    const res = await job.handler({ event, step: step() })
    expect(res).toEqual({ paused: true, expired: true })
    expect(analyzePendingPhotos).not.toHaveBeenCalled()
    expect(mockGraphInvoke).not.toHaveBeenCalled()
    expect(mockRecordCreditDebit).not.toHaveBeenCalled()
  })

  it('a pause that expires before generating keeps the analyzed photos but generates and debits nothing', async () => {
    pendingCount = 2
    continueOrPause.mockResolvedValueOnce('continue').mockResolvedValueOnce('expired')
    const res = await job.handler({ event, step: step() })
    expect(res).toEqual({ paused: true, expired: true })
    expect(analyzePendingPhotos).toHaveBeenCalled()
    expect(mockGraphInvoke).not.toHaveBeenCalled()
    expect(mockRecordCreditDebit).not.toHaveBeenCalled()
  })
})
