// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 4b/4c: the analyze-photos job and the `vision` model slot.
 *  - slot unset -> exactly today's ladder (undefined model everywhere);
 *  - slot = Haiku -> Haiku-first: escalate to the Sonnet chat model once when the
 *    result is invalid / short / measurement-less; prose (no truncation retry)
 *    only if the escalated structured call also fails;
 *  - slot = Sonnet/Opus -> that model on today's ladder, no escalation.
 */

const mockAnalyzePhotoOR = vi.fn()
const mockAnalyzePhotoSingleAttemptOR = vi.fn()
const mockAnalyzePhotoStructuredOR = vi.fn()
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
  OR_DEFAULTS: { chat: 'anthropic/claude-sonnet-5.5', fast: 'anthropic/claude-haiku-5.5' },
  analyzePhotoOR: (...args: unknown[]) => mockAnalyzePhotoOR(...args),
  analyzePhotoSingleAttemptOR: (...args: unknown[]) => mockAnalyzePhotoSingleAttemptOR(...args),
  analyzePhotoStructuredOR: (...args: unknown[]) => mockAnalyzePhotoStructuredOR(...args),
}))
// The `vision` slot as the job resolves it (undefined = nothing configured).
let visionSlot: string | undefined
vi.mock('@/lib/ai/step-models', () => ({
  resolveSlotModel: async (_slot: string, fallback: unknown) => visionSlot ?? fallback,
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
        return {
          select: () => {
            const chain = {
              eq: (..._args: unknown[]) => chain,
              in: (..._args: unknown[]) => chain,
              then: (
                resolve: (v: { data: Array<{ real_cost_usd: number | null }> }) => unknown,
                reject?: (e: unknown) => unknown
              ) =>
                Promise.resolve({ data: [{ real_cost_usd: 0.01 }] }).then(resolve, reject),
            }
            return chain
          },
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

const HAIKU = 'anthropic/claude-haiku-5.5'
const SONNET = 'anthropic/claude-sonnet-5.5'
const OPUS = 'anthropic/claude-opus-5'

const GOOD = {
  version: 1,
  surfaces: [],
  measurements: [{ dimension: 'area', value: 100, unit: 'sq ft', subject: 'floor', confidence: 'estimated' }],
  materials: [],
  damage: [],
  trade_signals: ['flooring'],
  access_notes: null,
  overall_description: 'A kitchen with worn oak plank flooring and granite counters.',
}

const modelsOfStructuredCalls = () => mockAnalyzePhotoStructuredOR.mock.calls.map((c) => c[2])

describe('analyze-photos vision slot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    visionSlot = undefined
    state.photos = makePhotos(1)
    state.updateCalls = []
    state.downloadShouldFail = new Set()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('DEFAULT (slot unset): structured and prose calls use no explicit model, exactly as today', async () => {
    mockAnalyzePhotoStructuredOR.mockRejectedValue(new Error('down'))
    mockAnalyzePhotoOR.mockResolvedValue('prose')
    await invokeJob()
    expect(modelsOfStructuredCalls()).toEqual([undefined])
    expect(mockAnalyzePhotoOR.mock.calls[0][2]).toBeUndefined()
    // No options argument: the truncation retry stays on in the default mode.
    expect(mockAnalyzePhotoOR.mock.calls[0]).toHaveLength(4)
    expect(mockAnalyzePhotoStructuredOR.mock.calls[0]).toHaveLength(4)
  })

  it('Haiku slot, strong result: one Haiku call, no escalation', async () => {
    visionSlot = HAIKU
    mockAnalyzePhotoStructuredOR.mockResolvedValue(GOOD)
    await invokeJob()
    expect(modelsOfStructuredCalls()).toEqual([HAIKU])
    expect(mockAnalyzePhotoOR).not.toHaveBeenCalled()
    expect(mockAnalyzePhotoSingleAttemptOR).not.toHaveBeenCalled()
    expect(state.updateCalls[0].patch).toMatchObject({ ai_description: GOOD.overall_description })
  })

  it.each([
    ['short description', { ...GOOD, overall_description: 'A kitchen floor.' }],
    ['empty measurements with trade signals', { ...GOOD, measurements: [] }],
  ])('Haiku slot, weak result (%s): escalates once to Sonnet and persists the Sonnet result', async (_n, weak) => {
    visionSlot = HAIKU
    const strong = { ...GOOD, overall_description: 'Sonnet: worn oak plank flooring in a galley kitchen.' }
    mockAnalyzePhotoStructuredOR.mockResolvedValueOnce(weak).mockResolvedValueOnce(strong)
    await invokeJob()
    expect(modelsOfStructuredCalls()).toEqual([HAIKU, SONNET])
    expect(mockAnalyzePhotoOR).not.toHaveBeenCalled()
    expect(state.updateCalls[0].patch).toMatchObject({ ai_description: strong.overall_description })
  })

  it('Haiku slot, empty measurements WITHOUT trade signals is acceptable (no escalation)', async () => {
    visionSlot = HAIKU
    mockAnalyzePhotoStructuredOR.mockResolvedValue({ ...GOOD, measurements: [], trade_signals: [] })
    await invokeJob()
    expect(modelsOfStructuredCalls()).toEqual([HAIKU])
  })

  it('Haiku slot, Haiku fails (zod/HTTP): escalates to Sonnet', async () => {
    visionSlot = HAIKU
    mockAnalyzePhotoStructuredOR.mockRejectedValueOnce(new Error('schema')).mockResolvedValueOnce(GOOD)
    await invokeJob()
    expect(modelsOfStructuredCalls()).toEqual([HAIKU, SONNET])
    expect(mockAnalyzePhotoOR).not.toHaveBeenCalled()
  })

  it('Haiku slot, both structured calls fail: prose on Sonnet, once, without the truncation retry', async () => {
    visionSlot = HAIKU
    mockAnalyzePhotoStructuredOR.mockRejectedValue(new Error('down'))
    mockAnalyzePhotoSingleAttemptOR.mockResolvedValue('prose')
    await invokeJob()
    expect(modelsOfStructuredCalls()).toEqual([HAIKU, SONNET])
    expect(mockAnalyzePhotoSingleAttemptOR).toHaveBeenCalledOnce()
    expect(mockAnalyzePhotoSingleAttemptOR.mock.calls[0][2]).toBe(SONNET)
    expect(mockAnalyzePhotoOR).not.toHaveBeenCalled()
  })

  it('Haiku slot, weak Haiku result and the escalated call fails: keeps the valid Haiku result, no prose', async () => {
    visionSlot = HAIKU
    const weak = { ...GOOD, overall_description: 'A kitchen floor.' }
    mockAnalyzePhotoStructuredOR.mockResolvedValueOnce(weak).mockRejectedValueOnce(new Error('down'))
    await invokeJob()
    expect(mockAnalyzePhotoOR).not.toHaveBeenCalled()
    expect(state.updateCalls[0].patch).toMatchObject({ ai_description: 'A kitchen floor.' })
  })

  it('Haiku slot: Langfuse metadata names the serving model and the escalation', async () => {
    visionSlot = HAIKU
    mockAnalyzePhotoStructuredOR
      .mockResolvedValueOnce({ ...GOOD, measurements: [] })
      .mockResolvedValueOnce(GOOD)
    await invokeJob()
    expect(mockAnalyzePhotoStructuredOR.mock.calls[0][4]).toMatchObject({ vision_mode: 'haiku_first', escalated: false })
    expect(mockAnalyzePhotoStructuredOR.mock.calls[1][4]).toMatchObject({
      escalated: true,
      escalated_from: HAIKU,
      escalation_reason: 'empty_measurements_with_signals',
    })
  })

  it.each([SONNET, OPUS])('%s slot: that model on today\'s ladder, no escalation, prose keeps its retry', async (m) => {
    visionSlot = m
    mockAnalyzePhotoStructuredOR.mockRejectedValue(new Error('down'))
    mockAnalyzePhotoOR.mockResolvedValue('prose')
    await invokeJob()
    expect(modelsOfStructuredCalls()).toEqual([m])
    expect(mockAnalyzePhotoOR.mock.calls[0][2]).toBe(m)
    expect(mockAnalyzePhotoOR.mock.calls[0]).toHaveLength(4)
  })
})
