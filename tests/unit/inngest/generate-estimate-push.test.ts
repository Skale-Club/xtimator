import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 260928: the generate-estimate job pushes the outcome to the person who
 * started the capture (lib/notifications/estimate-push.ts), in its own
 * memoized step, and never for MCP callers.
 */

const mockSendEstimatePush = vi.fn().mockResolvedValue({ sent: 1, removed: 0 })
vi.mock('@/lib/notifications/estimate-push', () => ({
  sendEstimatePush: (...args: unknown[]) => mockSendEstimatePush(...args),
}))

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


function makeSvc() {
  return {
    from: (table: string) => {
      if (table === 'companies') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { user_id: 'owner-1', tier: 'free' } }) }) }) }
      }
      if (table === 'ai_cost_events') {
        const chain = {
          eq: () => chain,
          then: (resolve: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: [{ real_cost_usd: 0 }] }).then(resolve),
        }
        return { select: () => chain }
      }
      return { insert: async () => ({ error: null }) }
    },
  }
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => makeSvc(),
}))

function makeReplayStep(cache: Map<string, unknown>) {
  return {
    ids: [] as string[],
    run: async function (id: string, fn: () => unknown) {
      this.ids.push(id)
      if (cache.has(id)) return cache.get(id)
      const result = await fn()
      cache.set(id, result)
      return result
    },
  }
}

async function load() {
  const { generateEstimateJob } = await import('@/lib/inngest/functions/generate-estimate')
  return generateEstimateJob as unknown as {
    opts: { onFailure: (args: { event: unknown; error: unknown }) => Promise<void> }
    handler: (args: { event: unknown; step: ReturnType<typeof makeReplayStep> }) => Promise<unknown>
  }
}

const event = (extra: Record<string, unknown> = {}) => ({
  data: { companyId: 'company-1', projectId: 'project-1', requestId: 'req-1', attemptId: 'att-1', channel: 'web', ...extra },
})

describe('generate-estimate push (260928)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEntitlementsForTier.mockResolvedValue({ maxEstimatesPerMonth: null })
  })

  it('pushes "ready" with the estimate to the user who started the capture', async () => {
    mockGraphInvoke.mockResolvedValue({ estimateId: 'est-9' })
    const fn = await load()
    await fn.handler({ event: event({ notifyUserId: 'user-7' }), step: makeReplayStep(new Map()) })
    expect(mockSendEstimatePush).toHaveBeenCalledWith({
      kind: 'ready',
      userId: 'user-7',
      projectId: 'project-1',
      estimateId: 'est-9',
      attemptId: 'att-1',
    })
  })

  it('pushes "needs details" when no estimate survived the run', async () => {
    mockGraphInvoke.mockResolvedValue({ estimateId: null })
    const fn = await load()
    await fn.handler({ event: event({ notifyUserId: 'user-7' }), step: makeReplayStep(new Map()) })
    expect(mockSendEstimatePush).toHaveBeenCalledWith(expect.objectContaining({ kind: 'needs_details', estimateId: null }))
  })

  it('never pushes twice when Inngest replays the handler', async () => {
    mockGraphInvoke.mockResolvedValue({ estimateId: 'est-9' })
    const fn = await load()
    const cache = new Map<string, unknown>()
    await fn.handler({ event: event({ notifyUserId: 'user-7' }), step: makeReplayStep(cache) })
    await fn.handler({ event: event({ notifyUserId: 'user-7' }), step: makeReplayStep(cache) })
    expect(mockSendEstimatePush).toHaveBeenCalledTimes(1)
  })

  it('does not push for MCP callers or when nobody is known to have started it', async () => {
    mockGraphInvoke.mockResolvedValue({ estimateId: 'est-9' })
    const fn = await load()
    await fn.handler({ event: event({ notifyUserId: 'user-7', channel: 'mcp' }), step: makeReplayStep(new Map()) })
    await fn.handler({ event: event(), step: makeReplayStep(new Map()) })
    expect(mockSendEstimatePush).not.toHaveBeenCalled()
  })

  it('pushes "failed" from onFailure', async () => {
    const fn = await load()
    await fn.opts.onFailure({
      event: { data: { event: event({ notifyUserId: 'user-7' }) } },
      error: new Error('boom'),
    })
    expect(mockSendEstimatePush).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'failed', userId: 'user-7', projectId: 'project-1', attemptId: 'att-1' })
    )
  })
})
