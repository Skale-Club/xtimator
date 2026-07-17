import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Phase 167-01 (BILL-04 / BILL-05) — retry short-circuit + provider
 * attribution + ai_cost_events dedup.
 *
 * v4.19 audit D3: a generate-stage Retry re-dispatches the WHOLE pipeline; the
 * transcribe job had no transcript-exists short-circuit -> a second real
 * Whisper call + a duplicate ai_cost_events row (no unique index on
 * (attempt_id, operation_type)). Customer charged once (idempotent debit —
 * correct); platform pays N x, measured cost inflated N x.
 *
 * v4.19 audit D5: transcribeAudioOR discarded `servedBy`; the OpenAI-direct
 * fallback was recorded as provider 'openrouter' in both ai_cost_events and
 * pipeline_events.
 *
 * Part A: the job's short-circuit — transcript-exists skips download + Whisper
 *   + cost + debit entirely; generate dispatch still proceeds.
 * Part B: provider attribution — fallback records 'openai', not 'openrouter'.
 * Part C: recordAICost swallows a 23505 duplicate as success (never throws).
 * Part D: the migration's SQL dedupes existing rows BEFORE creating the
 *   partial unique index, and the index excludes vision/photo_batch.
 */

const mockGetTranscriptionModel = vi.fn().mockResolvedValue('whisper-1')
const mockTranscribeAudioOR = vi.fn()
const mockRecordPipelineEvent = vi.fn().mockResolvedValue(undefined)
const mockNotifyOps = vi.fn().mockResolvedValue(undefined)
const mockNotify = vi.fn().mockResolvedValue(undefined)
const mockBuildNotificationCopy = vi.fn(() => ({ title: 't', body: 'b' }))
const mockRecordAICost = vi.fn().mockResolvedValue(undefined)
const mockRecordCreditDebit = vi.fn().mockResolvedValue(undefined)
const mockCheckCredits = vi.fn().mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })
const mockGetEntitlementsForTier = vi.fn().mockResolvedValue({ maxAudioMinutesPerEstimate: 30 })
const mockInngestSend = vi.fn().mockResolvedValue({ ids: ['evt_test'] })

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: (opts: unknown, handler: unknown) => ({ opts, handler }),
    send: (...args: unknown[]) => mockInngestSend(...args),
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
  /** BILL-04: configurable per-test outcome for the ai_cost_events insert (recordAICost dedup tests). */
  aiCostInsertError: { code?: string; message: string } | null
} = {
  identRow: {
    company_id: 'company-1',
    project_id: 'project-1',
    duration_seconds: 60,
    transcript: null,
    companies: { user_id: 'user-1', tier: 'business' },
  },
  blobSize: 500_000,
  aiCostInsertError: null,
}

const downloadMock = vi.fn(async () => ({
  data: { size: svcConfig.blobSize } as unknown as Blob,
  error: null,
}))
const updateEqMock = vi.fn().mockResolvedValue({ error: null })
const aiCostInsertMock = vi.fn(async () => ({ error: svcConfig.aiCostInsertError }))

function makeSvc() {
  return {
    from: (table: string) => {
      if (table === 'recordings') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: svcConfig.identRow }) }) }),
          update: () => ({ eq: updateEqMock }),
        }
      }
      if (table === 'ai_cost_events') {
        return { insert: aiCostInsertMock }
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

async function invokeJob(overrides?: { autoGenerateEstimate?: boolean; attemptId?: string }) {
  const { transcribeAudioJob } = await import('@/lib/inngest/functions/transcribe-audio')
  const fn = transcribeAudioJob as unknown as {
    handler: (args: { event: unknown; step: typeof fakeStep }) => Promise<{ transcript: string }>
  }
  return fn.handler({
    event: {
      data: {
        recordingId: 'rec-1',
        storagePath: 'company-1/rec.webm',
        companyId: 'company-1',
        attemptId: overrides?.attemptId ?? 'attempt-1',
        requestId: 'req-1',
        ...(overrides?.autoGenerateEstimate ? { autoGenerateEstimate: true } : {}),
      },
    },
    step: fakeStep,
  })
}

describe('BILL-05: transcribe-audio retry short-circuit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTranscriptionModel.mockResolvedValue('whisper-1')
    mockCheckCredits.mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })
    mockGetEntitlementsForTier.mockResolvedValue({ maxAudioMinutesPerEstimate: 30 })
    downloadMock.mockClear()
    updateEqMock.mockClear().mockResolvedValue({ error: null })
    mockInngestSend.mockResolvedValue({ ids: ['evt_test'] })
    svcConfig.identRow = {
      company_id: 'company-1',
      project_id: 'project-1',
      duration_seconds: 60,
      transcript: null,
      companies: { user_id: 'user-1', tier: 'business' },
    }
    svcConfig.blobSize = 500_000
  })

  it('transcript already exists -> Whisper mock uncalled, no download, no cost, no debit, no save-transcript write', async () => {
    // Simulates a Retry dispatched after a LATER pipeline stage (generate)
    // failed: this recording was already transcribed on the original run.
    svcConfig.identRow.transcript = 'previously transcribed content'

    const result = await invokeJob()

    expect(result).toEqual({ transcript: 'previously transcribed content' })
    expect(downloadMock).not.toHaveBeenCalled()
    expect(mockTranscribeAudioOR).not.toHaveBeenCalled()
    expect(updateEqMock).not.toHaveBeenCalled()
    expect(mockRecordAICost).not.toHaveBeenCalled()
    expect(mockRecordCreditDebit).not.toHaveBeenCalled()
  })

  it('transcript already exists + autoGenerateEstimate -> generate dispatch STILL proceeds', async () => {
    svcConfig.identRow.transcript = 'previously transcribed content'

    await invokeJob({ autoGenerateEstimate: true })

    expect(mockInngestSend).toHaveBeenCalledOnce()
    const sendArgs = mockInngestSend.mock.calls[0][0] as { name: string }
    expect(sendArgs.name).toBe('estimate/generate.requested')
  })

  it('no existing transcript -> normal path runs (download + Whisper + cost + debit)', async () => {
    svcConfig.identRow.transcript = null
    mockTranscribeAudioOR.mockResolvedValue({ text: 'fresh transcript', servedBy: 'primary' })

    const result = await invokeJob()

    expect(result).toEqual({ transcript: 'fresh transcript' })
    expect(downloadMock).toHaveBeenCalledOnce()
    expect(mockTranscribeAudioOR).toHaveBeenCalledOnce()
    expect(updateEqMock).toHaveBeenCalledOnce()
    expect(mockRecordAICost).toHaveBeenCalledOnce()
    expect(mockRecordCreditDebit).toHaveBeenCalledOnce()
  })

  it('an empty-string transcript (falsy) does NOT short-circuit (treated as "no transcript yet")', async () => {
    svcConfig.identRow.transcript = ''
    mockTranscribeAudioOR.mockResolvedValue({ text: 'fresh transcript', servedBy: 'primary' })

    await invokeJob()

    expect(downloadMock).toHaveBeenCalledOnce()
    expect(mockTranscribeAudioOR).toHaveBeenCalledOnce()
  })
})

describe('BILL-05/D5: provider attribution reflects servedBy, not a hardcoded value', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTranscriptionModel.mockResolvedValue('whisper-1')
    mockCheckCredits.mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })
    mockGetEntitlementsForTier.mockResolvedValue({ maxAudioMinutesPerEstimate: 30 })
    downloadMock.mockClear()
    updateEqMock.mockClear().mockResolvedValue({ error: null })
    svcConfig.identRow = {
      company_id: 'company-1',
      project_id: 'project-1',
      duration_seconds: 60,
      transcript: null,
      companies: { user_id: 'user-1', tier: 'business' },
    }
    svcConfig.blobSize = 500_000
  })

  it("servedBy 'fallback' -> the cost row AND the succeeded pipeline event record provider 'openai'", async () => {
    mockTranscribeAudioOR.mockResolvedValue({ text: 'via openai fallback', servedBy: 'fallback' })

    await invokeJob()

    const costCall = mockRecordAICost.mock.calls[0][0] as { provider: string }
    expect(costCall.provider).toBe('openai')

    const succeededCall = mockRecordPipelineEvent.mock.calls.find(
      (c) => (c[0] as { status?: string }).status === 'succeeded'
    )?.[0] as { provider?: string } | undefined
    expect(succeededCall?.provider).toBe('openai')
  })

  it("servedBy 'primary' -> both record provider 'openrouter'", async () => {
    mockTranscribeAudioOR.mockResolvedValue({ text: 'via openrouter primary', servedBy: 'primary' })

    await invokeJob()

    const costCall = mockRecordAICost.mock.calls[0][0] as { provider: string }
    expect(costCall.provider).toBe('openrouter')

    const succeededCall = mockRecordPipelineEvent.mock.calls.find(
      (c) => (c[0] as { status?: string }).status === 'succeeded'
    )?.[0] as { provider?: string } | undefined
    expect(succeededCall?.provider).toBe('openrouter')
  })
})

describe('BILL-04: recordAICost dedup — swallows a 23505 duplicate as success', () => {
  // The real (non-mocked) recordAICost — this file mocks '@/lib/billing/record-ai-cost'
  // for the transcribe-audio job tests above, so `vi.importActual` bypasses
  // that mock to exercise the genuine implementation here. It still resolves
  // its own `requireServiceClient` import through this file's shared
  // '@/lib/supabase/service' mock (makeSvc's 'ai_cost_events' branch, driven
  // by svcConfig.aiCostInsertError below).
  async function getRealRecordAICost() {
    const mod = await vi.importActual<typeof import('@/lib/billing/record-ai-cost')>(
      '@/lib/billing/record-ai-cost'
    )
    return mod.recordAICost
  }

  beforeEach(() => {
    aiCostInsertMock.mockClear()
    svcConfig.aiCostInsertError = null
  })

  it('inserts fine (no error) -> resolves without warning', async () => {
    const recordAICost = await getRealRecordAICost()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(
      recordAICost({
        attemptId: 'a1',
        operationType: 'audio_minutes',
        provider: 'openrouter',
        realCostUsd: 0.01,
      })
    ).resolves.toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('a 23505 duplicate-key error -> resolves WITHOUT throwing and WITHOUT warning (the dedup guard working as intended)', async () => {
    svcConfig.aiCostInsertError = { code: '23505', message: 'duplicate key value' }
    const recordAICost = await getRealRecordAICost()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(
      recordAICost({
        attemptId: 'a1',
        operationType: 'audio_minutes',
        provider: 'openrouter',
        realCostUsd: 0.01,
      })
    ).resolves.toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('any OTHER error code -> resolves without throwing but DOES warn', async () => {
    svcConfig.aiCostInsertError = { code: '23502', message: 'not null violation' }
    const recordAICost = await getRealRecordAICost()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(
      recordAICost({
        attemptId: 'a2',
        operationType: 'estimate',
        provider: 'anthropic',
        realCostUsd: 0.02,
      })
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('BILL-04: ai_cost_events dedup migration — static SQL contract', () => {
  const MIGRATION_PATH = resolve(
    process.cwd(),
    'supabase/migrations/20260717000002_phase167_ai_cost_events_dedup.sql'
  )

  function readMigration(): string {
    return readFileSync(MIGRATION_PATH, 'utf8')
  }

  it('DELETE (dedupe) appears BEFORE the CREATE UNIQUE INDEX in the file', () => {
    const sql = readMigration()
    const deleteIdx = sql.search(/^\s*DELETE FROM public\.ai_cost_events/m)
    const indexIdx = sql.search(/CREATE UNIQUE INDEX/i)
    expect(deleteIdx).toBeGreaterThanOrEqual(0)
    expect(indexIdx).toBeGreaterThan(deleteIdx)
  })

  it('the DELETE dedupes by (attempt_id, operation_type) restricted to audio_minutes/estimate', () => {
    const sql = readMigration()
    expect(sql).toMatch(/a\.attempt_id\s*=\s*b\.attempt_id/)
    expect(sql).toMatch(/a\.operation_type\s*=\s*b\.operation_type/)
    expect(sql).toMatch(/operation_type IN \('audio_minutes', 'estimate'\)/)
  })

  it('the unique index is PARTIAL (WHERE operation_type IN audio_minutes/estimate) — vision/photo_batch stay unconstrained', () => {
    const sql = readMigration()
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS ai_cost_events_attempt_op_unique[\s\S]*ON public\.ai_cost_events \(attempt_id, operation_type\)[\s\S]*WHERE operation_type IN \('audio_minutes', 'estimate'\)/
    )
    expect(sql).not.toMatch(/WHERE[\s\S]{0,60}vision/i)
  })
})

describe('SCOPE FENCE: the vision section of openrouter-client.ts is untouched', () => {
  it('analyzePhotoOR keeps its original signature and vision-only cost context', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/ai/openrouter-client.ts'),
      'utf8'
    )
    expect(src).toMatch(
      /export async function analyzePhotoOR\(\s*base64: string,\s*mimeType: string,\s*model\?: string,\s*costContext\?: CostContext\s*\): Promise<string>/
    )
    // Vision cost recording is untouched — still hardcodes provider 'openrouter'
    // (167-02's territory), NOT threading a servedBy-derived provider.
    expect(src).toMatch(/operationType: 'vision'/)
  })
})
