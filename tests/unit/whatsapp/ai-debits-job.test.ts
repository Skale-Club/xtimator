import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * Phase 2a - whatsAppProcessJob debits the estimate generated from WhatsApp
 * exactly once, like the web generate-estimate job: a generation attempt derived
 * from the event's batchKey (retry-stable), threaded into the graph, and one
 * `record-credit-debit` step AFTER the work. There is no second path: WhatsApp
 * generation runs through this job's graph, never through the web Inngest job.
 */

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((opts: unknown, handler: unknown) => ({ opts, handler })),
  },
}))
vi.mock('@/lib/demo/guard', () => ({ assertCompanyWritable: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/whatsapp/client', () => ({
  sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/whatsapp/conversations', () => ({
  logOutboundMessage: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn(() => ({})) }))
vi.mock('@/instrumentation', () => ({ langfuseProcessor: undefined }))

const graphInvoke = vi.fn()
vi.mock('@/lib/whatsapp/estimate-graph', () => ({
  buildEstimateGraph: () => ({ invoke: (...a: unknown[]) => graphInvoke(...a) }),
}))

const debitWhatsAppEstimate = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/whatsapp/credits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/whatsapp/credits')>()
  return {
    ...actual,
    debitWhatsAppEstimate: (...a: unknown[]) => debitWhatsAppEstimate(...a),
  }
})

type Handler = (ctx: {
  event: { data: Record<string, unknown> }
  step: { run: (id: string, fn: () => Promise<unknown>) => Promise<unknown> }
}) => Promise<unknown>

const EVENT = {
  data: {
    companyId: 'company-1',
    projectId: 'project-1',
    ownerPhone: '+15555550123',
    messages: [{ id: 'm1', type: 'text', text: { body: 'paint the fence' } }],
    batchKey: 'wa-batch-m1',
  },
}

async function runJob(stepOrder: string[] = []) {
  const { whatsAppProcessJob } = await import('@/lib/inngest/functions/whatsapp-process')
  const handler = (whatsAppProcessJob as unknown as { handler: Handler }).handler
  return handler({
    event: EVENT,
    step: {
      run: async (id, fn) => {
        stepOrder.push(id)
        return fn()
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  graphInvoke.mockResolvedValue({ estimateId: 'est-1', companyId: 'company-1' })
  debitWhatsAppEstimate.mockResolvedValue(undefined)
})

describe('whatsAppProcessJob: estimate debit', () => {
  it('threads a batchKey-derived attemptId into the graph and debits the estimate once, after the work', async () => {
    const { waGenerationAttemptId } = await import('@/lib/whatsapp/credits')
    const order: string[] = []
    await runJob(order)

    const expected = waGenerationAttemptId('wa-batch-m1')
    expect(graphInvoke).toHaveBeenCalledTimes(1)
    expect((graphInvoke.mock.calls[0][0] as { attemptId: string }).attemptId).toBe(expected)
    expect(debitWhatsAppEstimate).toHaveBeenCalledTimes(1)
    expect(debitWhatsAppEstimate).toHaveBeenCalledWith({ companyId: 'company-1', attemptId: expected })
    // Retry-isolated debit step comes after the orchestration step, like the web job.
    expect(order.indexOf('record-credit-debit')).toBeGreaterThan(order.indexOf('orchestrate-estimate'))
  })

  it('an Inngest retry reuses the SAME attemptId, so the ledger key (`${attemptId}:debit:estimate`) is unchanged', async () => {
    await runJob()
    await runJob()
    const ids = debitWhatsAppEstimate.mock.calls.map((c) => (c[0] as { attemptId: string }).attemptId)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
  })

  it('a different batch gets a different attempt (a second estimate is a second charge)', async () => {
    const { waGenerationAttemptId } = await import('@/lib/whatsapp/credits')
    expect(waGenerationAttemptId('wa-batch-m1')).not.toBe(waGenerationAttemptId('wa-batch-m2'))
  })

  it('a run that ended in failure-as-state (no estimate produced) is not debited', async () => {
    graphInvoke.mockResolvedValue({ failure: { reason: 'generation_failed' } })
    await runJob()
    expect(debitWhatsAppEstimate).not.toHaveBeenCalled()
  })

  it('a needs-details (vague) run spent real money and is debited, like the web job', async () => {
    graphInvoke.mockResolvedValue({ estimateId: 'est-1', isVague: true })
    await runJob()
    expect(debitWhatsAppEstimate).toHaveBeenCalledTimes(1)
  })
})
