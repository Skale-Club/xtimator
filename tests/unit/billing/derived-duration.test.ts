// @vitest-environment node
/**
 * Phase 188 Plan 04 (PROV-02) deviation: this suite exercises the real
 * transcribe-audio worker, which now resolves its audio download via
 * serverStorage(supabase) -> assertServer() (Phase 188 fix — the census
 * gate found transcribe-audio.ts using a raw supabase.storage.from(...)
 * call that Plans 01-03 had missed). assertServer() throws whenever
 * `typeof window !== 'undefined'`, which is always true under the suite's
 * default jsdom environment regardless of mocking. The `node` override here
 * matches the fix already applied across Plans 01-03's own test files for
 * the identical root cause.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NonRetriableError } from 'inngest'

/**
 * Phase 167-01 (BILL-02 / BILL-06) — server-derived audio duration +
 * entitlement enforcement.
 *
 * v4.19 audit D2: Whisper cost/debit keyed on the CLIENT-DECLARED
 * `duration_seconds` (validated only 0<d<=900) — declaring 1s on a 10-min take
 * produced cost $0.0001 -> debit round(0.045)=0 credits ("one credit funds
 * unlimited transcription"). Compounded by `maxAudioMinutesPerEstimate`
 * (free 2 / pro 15 / business 30) being enforced NOWHERE (a dead entitlement).
 *
 * Part A: `deriveAudioMinutes` — the pure byte-clamp derivation seam.
 * Part B: the transcribe-audio Inngest job wires it in BEFORE the Whisper
 *   call, uses it for cost/debit, and rejects an over-cap recording with a
 *   NonRetriableError, charging nothing.
 * Part C: `lib/actions/recording.ts`'s createRecording pre-dispatch belt
 *   (honest-path UX, NOT the authoritative gate).
 */

import { deriveAudioMinutes } from '@/lib/billing/whisper-cost'

describe('BILL-02: deriveAudioMinutes — one-sided byte-clamp derivation', () => {
  it('declared-within-band (honest, declared >= byte estimate) -> declared', () => {
    // 3 min declared, encoded at 96kbps -> byteEstimateMinutes = 2.25 min < declared.
    const bytes = (96_000 * 180) / 8 // 2,160,000 bytes for a 180s clip at 96kbps
    const result = deriveAudioMinutes({ declaredSeconds: 180, blobBytes: bytes })
    expect(result.source).toBe('declared')
    expect(result.minutes).toBeCloseTo(3, 5)
  })

  it('the 1s-on-10-min exploit: under-declared 1s on a 5MB blob -> byte_clamp (declared discarded)', () => {
    const result = deriveAudioMinutes({ declaredSeconds: 1, blobBytes: 5_000_000 })
    expect(result.source).toBe('byte_clamp')
    // byteEstimateMinutes = 5,000,000 * 8 / 128_000 / 60 ~= 5.2083
    expect(result.minutes).toBeCloseTo(5.2083, 3)
    expect(result.minutes).toBeGreaterThan(5)
  })

  it('over-declared (declared far exceeds the byte estimate) -> declared, NEVER down-clamped', () => {
    // Tiny 100KB blob (byteEstimateMinutes ~0.104 min) but declared 10 minutes —
    // declaring MORE than the true duration only costs the declarer, never the
    // platform, so nothing is corrected.
    const result = deriveAudioMinutes({ declaredSeconds: 600, blobBytes: 100_000 })
    expect(result.source).toBe('declared')
    expect(result.minutes).toBe(10)
  })

  it('null declared -> byte_clamp', () => {
    const result = deriveAudioMinutes({ declaredSeconds: null, blobBytes: 1_000_000 })
    expect(result.source).toBe('byte_clamp')
    expect(result.minutes).toBeCloseTo((1_000_000 * 8) / 128_000 / 60, 5)
  })

  it('zero or negative declared -> treated as unknown -> byte_clamp', () => {
    expect(deriveAudioMinutes({ declaredSeconds: 0, blobBytes: 500_000 }).source).toBe(
      'byte_clamp'
    )
    expect(deriveAudioMinutes({ declaredSeconds: -5, blobBytes: 500_000 }).source).toBe(
      'byte_clamp'
    )
  })

  it('tiny blob sanity: zero bytes + null declared -> minutes 0, never NaN/negative', () => {
    const result = deriveAudioMinutes({ declaredSeconds: null, blobBytes: 0 })
    expect(result.source).toBe('byte_clamp')
    expect(result.minutes).toBe(0)
    expect(Number.isNaN(result.minutes)).toBe(false)
    expect(result.minutes).toBeGreaterThanOrEqual(0)
  })

  it('a declared value exactly equal to the byte estimate is NOT clamped (equal counts as safe/declared)', () => {
    const bytes = 1_280_000
    const byteEstimateMinutes = (bytes * 8) / 128_000 / 60
    const result = deriveAudioMinutes({
      declaredSeconds: byteEstimateMinutes * 60,
      blobBytes: bytes,
    })
    expect(result.source).toBe('declared')
  })

  it('respects a custom bitrateBps override (halving the assumed bitrate doubles the estimate)', () => {
    const result64 = deriveAudioMinutes({
      declaredSeconds: null,
      blobBytes: 1_000_000,
      bitrateBps: 64_000,
    })
    const result128 = deriveAudioMinutes({
      declaredSeconds: null,
      blobBytes: 1_000_000,
      bitrateBps: 128_000,
    })
    expect(result64.minutes).toBeCloseTo(result128.minutes * 2, 5)
  })
})

// ---------------------------------------------------------------------------
// Part B: the transcribe-audio Inngest job wires deriveAudioMinutes in before
// the Whisper call and enforces BILL-06's entitlement cap against it.
// ---------------------------------------------------------------------------

const mockGetTranscriptionModel = vi.fn().mockResolvedValue('whisper-1')
const mockTranscribeAudioOR = vi.fn()
const mockRecordPipelineEvent = vi.fn().mockResolvedValue(undefined)
const mockNotifyOps = vi.fn().mockResolvedValue(undefined)
const mockNotify = vi.fn().mockResolvedValue(undefined)
const mockBuildNotificationCopy = vi.fn((..._args: unknown[]) => ({ title: 't', body: 'b' }))
const mockRecordAICost = vi.fn().mockResolvedValue(undefined)
const mockRecordCreditDebit = vi.fn().mockResolvedValue(undefined)
const mockCheckCredits = vi.fn().mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })
const mockGetEntitlementsForTier = vi.fn()

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: (opts: unknown, handler: unknown) => ({ opts, handler }),
    send: vi.fn().mockResolvedValue({ ids: ['evt_test'] }),
  },
}))
vi.mock('@/lib/platform-config', () => ({
  getTranscriptionModel: () => mockGetTranscriptionModel(),
}))
vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: (...args: unknown[]) => mockTranscribeAudioOR(...args),
}))
vi.mock('@/lib/observability/pipeline-events', () => ({
  recordPipelineEvent: (...args: unknown[]) => mockRecordPipelineEvent(...args),
}))
vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: (...args: unknown[]) => mockNotifyOps(...args),
}))
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
}))
vi.mock('@/lib/notifications/copy', () => ({
  buildNotificationCopy: (...args: unknown[]) => mockBuildNotificationCopy(...args),
}))
vi.mock('@/lib/billing/record-ai-cost', () => ({
  recordAICost: (...args: unknown[]) => mockRecordAICost(...args),
}))
vi.mock('@/lib/billing/credit-ledger', () => ({
  recordCreditDebit: (...args: unknown[]) => mockRecordCreditDebit(...args),
  checkCredits: (...args: unknown[]) => mockCheckCredits(...args),
}))
vi.mock('@/lib/entitlements-server', () => ({
  getEntitlementsForTier: (...args: unknown[]) => mockGetEntitlementsForTier(...args),
}))

type IdentRow = {
  company_id: string | null
  project_id: string | null
  duration_seconds: number | null
  transcript: string | null
  companies: { user_id: string | null; tier: string | null } | null
}

const svcConfig: {
  identRow: IdentRow
  blobSize: number
  downloadError: { message: string } | null
} = {
  identRow: {
    company_id: 'company-1',
    project_id: 'project-1',
    duration_seconds: 1,
    transcript: null,
    companies: { user_id: 'user-1', tier: 'free' },
  },
  blobSize: 1000,
  downloadError: null,
}

const downloadMock = vi.fn(async () =>
  svcConfig.downloadError
    ? { data: null, error: svcConfig.downloadError }
    : { data: { size: svcConfig.blobSize } as unknown as Blob, error: null }
)
const updateEqMock = vi.fn().mockResolvedValue({ error: null })

function makeSvc() {
  return {
    from: (table: string) => {
      if (table === 'recordings') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: svcConfig.identRow }) }) }),
          update: () => ({ eq: updateEqMock }),
        }
      }
      return { insert: async () => ({ error: null }) }
    },
    storage: { from: () => ({ download: downloadMock }) },
  }
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => makeSvc(),
}))

const fakeStep = { run: async (_id: string, fn: () => unknown) => fn() }

describe('BILL-02/06: transcribe-audio job wires deriveAudioMinutes + the entitlement cap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTranscriptionModel.mockResolvedValue('whisper-1')
    mockCheckCredits.mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })
    downloadMock.mockClear()
    updateEqMock.mockClear().mockResolvedValue({ error: null })
    svcConfig.identRow = {
      company_id: 'company-1',
      project_id: 'project-1',
      duration_seconds: 1,
      transcript: null,
      companies: { user_id: 'user-1', tier: 'free' },
    }
    svcConfig.downloadError = null
  })

  it('the 1s-declared/big-blob exploit yields byte_clamp minutes ~= blob-derived (debit input is significant, not near-zero)', async () => {
    // 10 minutes of audio at 128kbps = 9,600,000 bytes; client declared only 1s.
    svcConfig.identRow.duration_seconds = 1
    svcConfig.blobSize = 9_600_000
    mockGetEntitlementsForTier.mockResolvedValue({ maxAudioMinutesPerEstimate: 30 }) // business cap — isolates this test from BILL-06's cap
    mockTranscribeAudioOR.mockResolvedValue({ text: 'hello world', servedBy: 'primary' })

    const { transcribeAudioJob } = await import('@/lib/inngest/functions/transcribe-audio')
    const fn = transcribeAudioJob as unknown as {
      handler: (args: { event: unknown; step: typeof fakeStep }) => Promise<unknown>
    }

    await fn.handler({
      event: {
        data: {
          recordingId: 'rec-1',
          storagePath: 'company-1/rec.webm',
          companyId: 'company-1',
          attemptId: 'attempt-1',
        },
      },
      step: fakeStep,
    })

    expect(mockTranscribeAudioOR).toHaveBeenCalledOnce()
    expect(mockRecordAICost).toHaveBeenCalledOnce()
    const costCall = mockRecordAICost.mock.calls[0][0] as { units: number; realCostUsd: number }
    // Previously: declared 1s -> ~0.017 min -> debit ~= round(0.006 * 0.017) = 0 credits.
    // Now: byte-derived ~10 min -> a real, non-trivial cost.
    expect(costCall.units).toBeGreaterThan(9)
    expect(costCall.realCostUsd).toBeGreaterThan(0.05)
    expect(mockRecordCreditDebit).toHaveBeenCalledOnce()
  })

  it('BILL-06: over-cap rejection happens BEFORE the Whisper call and charges nothing', async () => {
    // 5 minutes of audio at 128kbps = 4,800,000 bytes; free tier caps at 2 min.
    svcConfig.identRow.duration_seconds = 1
    svcConfig.identRow.companies = { user_id: 'user-1', tier: 'free' }
    svcConfig.blobSize = 4_800_000
    mockGetEntitlementsForTier.mockResolvedValue({ maxAudioMinutesPerEstimate: 2 })

    const { transcribeAudioJob } = await import('@/lib/inngest/functions/transcribe-audio')
    const fn = transcribeAudioJob as unknown as {
      handler: (args: { event: unknown; step: typeof fakeStep }) => Promise<unknown>
    }

    await expect(
      fn.handler({
        event: {
          data: {
            recordingId: 'rec-2',
            storagePath: 'company-1/rec2.webm',
            companyId: 'company-1',
            attemptId: 'attempt-2',
          },
        },
        step: fakeStep,
      })
    ).rejects.toThrow(/exceeds the free plan's 2-minute/)

    expect(mockTranscribeAudioOR).not.toHaveBeenCalled()
    expect(mockRecordAICost).not.toHaveBeenCalled()
    expect(mockRecordCreditDebit).not.toHaveBeenCalled()
    expect(updateEqMock).not.toHaveBeenCalled()
  })

  it('BILL-06: the over-cap rejection is a NonRetriableError (no retry burn before onFailure)', async () => {
    svcConfig.identRow.duration_seconds = 1
    svcConfig.blobSize = 4_800_000
    mockGetEntitlementsForTier.mockResolvedValue({ maxAudioMinutesPerEstimate: 2 })

    const { transcribeAudioJob } = await import('@/lib/inngest/functions/transcribe-audio')
    const fn = transcribeAudioJob as unknown as {
      handler: (args: { event: unknown; step: typeof fakeStep }) => Promise<unknown>
    }

    let caught: unknown
    try {
      await fn.handler({
        event: {
          data: {
            recordingId: 'rec-3',
            storagePath: 'company-1/rec3.webm',
            companyId: 'company-1',
            attemptId: 'attempt-3',
          },
        },
        step: fakeStep,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(NonRetriableError)
  })
})

// ---------------------------------------------------------------------------
// Part C: lib/actions/recording.ts's createRecording pre-dispatch belt
// (honest-path UX — NOT the authoritative gate, which is Part B above).
// ---------------------------------------------------------------------------

const mockGetClaims = vi.fn()
const mockFromRecording = vi.fn()
const mockGetActiveCompanyId = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: mockGetClaims },
    from: mockFromRecording,
  })),
}))
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: (...args: unknown[]) => mockGetActiveCompanyId(...args),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('BILL-06: createRecording pre-dispatch entitlement belt (honest-path UX)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    mockGetActiveCompanyId.mockResolvedValue('company-1')
  })

  function mockSupabaseFrom(tier: string) {
    const insertSpy = vi.fn().mockImplementation((row: unknown) => ({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'rec-1', project_id: 'project-1', ...(row as object) },
          error: null,
        }),
      }),
    }))
    mockFromRecording.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'company-1', tier }, error: null }),
            }),
          }),
        }
      }
      if (table === 'recordings') {
        return {
          insert: insertSpy,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
          }),
        }
      }
      if (table === 'projects') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'estimate_activity') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return {}
    })
    return insertSpy
  }

  it('rejects a client-declared duration that exceeds the resolved tier cap (free = 2 min) BEFORE inserting', async () => {
    mockGetEntitlementsForTier.mockResolvedValue({ maxAudioMinutesPerEstimate: 2 })
    const insertSpy = mockSupabaseFrom('free')

    const { createRecording } = await import('@/lib/actions/recording')
    // 180s = 3 min > the 2-minute free-tier cap.
    const result = await createRecording('project-1', 'company-1/project-1/rec.webm', 180)

    expect(result.error).toBeDefined()
    expect(result.error).toMatch(/free plan/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('accepts a client-declared duration within the resolved tier cap', async () => {
    mockGetEntitlementsForTier.mockResolvedValue({ maxAudioMinutesPerEstimate: 15 })
    const insertSpy = mockSupabaseFrom('pro')

    const { createRecording } = await import('@/lib/actions/recording')
    // 300s = 5 min, under the 15-minute pro cap.
    const result = await createRecording('project-1', 'company-1/project-1/rec.webm', 300)

    expect(result.error).toBeUndefined()
    expect(insertSpy).toHaveBeenCalledOnce()
  })
})
