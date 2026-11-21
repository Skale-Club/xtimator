import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRecordPipelineEvent = vi.fn().mockResolvedValue(undefined)
const mockTranscribe = vi.fn().mockResolvedValue({ text: 'hello', servedBy: 'primary' })
const mockDownload = vi.fn().mockResolvedValue(new Blob([new Uint8Array(1000)]))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { createFunction: (opts: unknown, handler: unknown) => ({ opts, handler }), send: vi.fn() },
}))
vi.mock('@/lib/demo/guard', () => ({ assertCompanyWritable: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: (table: string) => {
      if (table === 'recordings') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  company_id: 'c1',
                  project_id: 'p1',
                  duration_seconds: 30,
                  transcript: null,
                  companies: { user_id: 'u1', tier: 'free' },
                },
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      const chain: Record<string, unknown> = {}
      chain.eq = () => chain
      chain.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [{ real_cost_usd: 0 }] }).then(r)
      return { select: () => chain }
    },
  }),
}))
vi.mock('@/lib/storage/server', () => ({ serverStorage: () => ({ download: mockDownload }) }))
vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: (...a: unknown[]) => mockTranscribe(...a),
}))
vi.mock('@/lib/platform-config', () => ({ getTranscriptionModel: async () => 'openai/whisper-1' }))
vi.mock('@/lib/notifications/dispatch', () => ({ notify: vi.fn() }))
vi.mock('@/lib/notifications/copy', () => ({ buildNotificationCopy: () => ({ title: 't', body: 'b' }) }))
vi.mock('@/lib/observability/pipeline-events', () => ({
  recordPipelineEvent: (...a: unknown[]) => mockRecordPipelineEvent(...a),
}))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: vi.fn() }))
vi.mock('@/lib/billing/credit-ledger', () => ({ recordCreditDebit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/entitlements-server', () => ({
  getEntitlementsForTier: async () => ({ maxAudioMinutesPerEstimate: 15 }),
}))

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

async function load() {
  const { transcribeAudioJob } = await import('@/lib/inngest/functions/transcribe-audio')
  return transcribeAudioJob as unknown as {
    handler: (a: { event: unknown; step: ReturnType<typeof makeReplayStep> }) => Promise<unknown>
  }
}

const ev = (extra: Record<string, unknown> = {}) => ({
  data: { recordingId: 'r1', storagePath: 'c1/rec.webm', companyId: 'c1', ...extra },
})

describe('transcribe-audio replay safety and format', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps one attempt id and journals `started` once across replays when the producer sent none', async () => {
    const fn = await load()
    const cache = new Map<string, unknown>()
    await fn.handler({ event: ev(), step: makeReplayStep(cache) })
    await fn.handler({ event: ev(), step: makeReplayStep(cache) })
    const started = mockRecordPipelineEvent.mock.calls
      .map((c) => c[0] as { step: string; status: string; attemptId: string })
      .filter((e) => e.step === 'transcribe' && e.status === 'started')
    expect(started).toHaveLength(1)
    const ids = new Set(
      mockRecordPipelineEvent.mock.calls.map((c) => (c[0] as { attemptId: string }).attemptId)
    )
    expect(ids.size).toBe(1)
    expect(mockTranscribe.mock.calls[0][3]).toMatchObject({ attemptId: started[0].attemptId })
  })

  it('sends an iPhone .mp4 recording to the transcriber as m4a', async () => {
    const fn = await load()
    await fn.handler({ event: ev({ storagePath: 'c1/rec.mp4' }), step: makeReplayStep(new Map()) })
    expect(mockTranscribe.mock.calls[0][1]).toBe('m4a')
  })

  it('leaves webm untouched', async () => {
    const fn = await load()
    await fn.handler({ event: ev(), step: makeReplayStep(new Map()) })
    expect(mockTranscribe.mock.calls[0][1]).toBe('webm')
  })
})
