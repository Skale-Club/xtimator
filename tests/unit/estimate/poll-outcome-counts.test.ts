import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 168 (PHOTO-02 UI half): analyzedCount/totalCount/failedCount threading.
 *
 * 168-01 records { analyzedCount, totalCount, failedCount } on the analyze/
 * succeeded pipeline_events row's metadata (analyze-photos.ts:346-360). This
 * suite covers the two threading legs added in 168-02:
 *   1. lib/actions/attempt-outcome.ts — reads `metadata` off the journal row
 *      and surfaces the counts on the `pending` outcome payload.
 *   2. lib/estimate/poll-outcome.ts — forwards a pending outcome's counts
 *      through onStageProgress's StageProgress payload, unchanged otherwise.
 *
 * Mocking conventions follow tests/unit/actions/attempt-outcome.test.ts (leg 1)
 * and tests/unit/estimate/poll-outcome.test.ts (leg 2).
 */

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import { getAttemptOutcome } from '@/lib/actions/attempt-outcome'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'

const mockCreateClient = vi.mocked(createClient)
const mockGetActiveCompanyId = vi.mocked(getActiveCompanyId)
const mockRequireServiceClient = vi.mocked(requireServiceClient)

interface JournalRowFixture {
  step: string
  status: string
  error_code: string | null
  error_message: string | null
  estimate_id: string | null
  company_id: string | null
  project_id?: string | null
  created_at?: string
  metadata?: Record<string, unknown> | null
}

function makeAuthedSupabase() {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-1' } } }),
    },
  }
}

function makeServiceClientMock(rows: JournalRowFixture[]) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'pipeline_events') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: rows }),
            }),
          }),
        }
      }
      if (table === 'estimates') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { needs_details: null } }),
            }),
          }),
        }
      }
      return {}
    }),
  }
}

describe('getAttemptOutcome — analyze coverage counts (PHOTO-02 UI half)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateClient.mockResolvedValue(makeAuthedSupabase() as never)
    mockGetActiveCompanyId.mockResolvedValue('company-1')
  })

  it('a journal analyze/succeeded row with metadata {20,35,0} -> pending carries the counts', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock([
        {
          step: 'save_recording',
          status: 'succeeded',
          error_code: null,
          error_message: null,
          estimate_id: null,
          company_id: 'company-1',
        },
        {
          step: 'analyze',
          status: 'succeeded',
          error_code: null,
          error_message: null,
          estimate_id: null,
          company_id: 'company-1',
          metadata: { analyzedCount: 20, totalCount: 35, failedCount: 0 },
        },
      ]) as never
    )

    const result = await getAttemptOutcome('attempt-partial')

    expect(result).toEqual({
      state: 'pending',
      lastStep: 'analyze',
      lastStatus: 'succeeded',
      completedSteps: ['save_recording', 'analyze'],
      activeStepStartedAt: null,
      analyzedCount: 20,
      totalCount: 35,
      failedCount: 0,
    })
  })

  it('a partial batch with failures {18,35,2} -> counts surfaced verbatim', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock([
        {
          step: 'analyze',
          status: 'succeeded',
          error_code: null,
          error_message: null,
          estimate_id: null,
          company_id: 'company-1',
          metadata: { analyzedCount: 18, totalCount: 35, failedCount: 2 },
        },
      ]) as never
    )

    const result = await getAttemptOutcome('attempt-with-failures')

    expect(result).toMatchObject({
      state: 'pending',
      analyzedCount: 18,
      totalCount: 35,
      failedCount: 2,
    })
  })

  it('no analyze step in the journal (audio-only attempt) -> counts stay absent (byte-identical to pre-168-02)', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock([
        {
          step: 'save_recording',
          status: 'succeeded',
          error_code: null,
          error_message: null,
          estimate_id: null,
          company_id: 'company-1',
        },
        {
          step: 'transcribe',
          status: 'started',
          error_code: null,
          error_message: null,
          estimate_id: null,
          company_id: 'company-1',
        },
      ]) as never
    )

    const result = await getAttemptOutcome('attempt-audio-only')

    expect(result).toEqual({
      state: 'pending',
      lastStep: 'transcribe',
      lastStatus: 'started',
      completedSteps: ['save_recording'],
      activeStepStartedAt: undefined,
    })
    expect(result).not.toHaveProperty('analyzedCount')
    expect(result).not.toHaveProperty('totalCount')
    expect(result).not.toHaveProperty('failedCount')
  })

  it('malformed/non-numeric metadata is tolerated -> counts stay absent (never throws)', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock([
        {
          step: 'analyze',
          status: 'succeeded',
          error_code: null,
          error_message: null,
          estimate_id: null,
          company_id: 'company-1',
          metadata: { analyzedCount: 'twenty', totalCount: null } as unknown as Record<string, unknown>,
        },
      ]) as never
    )

    const result = await getAttemptOutcome('attempt-malformed-metadata')

    expect(result).toMatchObject({ state: 'pending' })
    expect(result).not.toHaveProperty('analyzedCount')
    expect(result).not.toHaveProperty('totalCount')
    expect(result).not.toHaveProperty('failedCount')
  })
})

describe('pollEstimateOutcome — forwards analyze coverage counts through StageProgress', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('mock getAttemptOutcome pending-with-counts -> StageProgress carries them through onStageProgress', async () => {
    vi.doMock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
    vi.doMock('@/lib/actions/attempt-outcome', () => ({
      getAttemptOutcome: vi.fn().mockResolvedValue({
        state: 'pending',
        lastStep: 'analyze',
        lastStatus: 'succeeded',
        completedSteps: ['save_recording', 'analyze'],
        activeStepStartedAt: null,
        analyzedCount: 20,
        totalCount: 35,
        failedCount: 0,
      }),
    }))

    const { pollEstimateOutcome } = await import('@/lib/estimate/poll-outcome')
    const onStageProgress = vi.fn()

    const outcome = await pollEstimateOutcome({
      projectId: 'proj-1',
      previousEstimateId: null,
      signal: new AbortController().signal,
      attemptId: 'attempt-1',
      intervalMs: 5,
      timeoutMs: 30,
      onStageProgress,
    })

    expect(outcome).toEqual({ state: 'timeout' })
    expect(onStageProgress).toHaveBeenCalledWith({
      lastStep: 'analyze',
      completedSteps: ['save_recording', 'analyze'],
      activeStepStartedAt: null,
      analyzedCount: 20,
      totalCount: 35,
      failedCount: 0,
    })
  })

  it('mock getAttemptOutcome pending-without-counts -> StageProgress omits them (byte-identical to pre-168-02)', async () => {
    vi.doMock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
    vi.doMock('@/lib/actions/attempt-outcome', () => ({
      getAttemptOutcome: vi.fn().mockResolvedValue({
        state: 'pending',
        lastStep: 'transcribe',
        lastStatus: 'started',
        completedSteps: ['save_recording'],
        activeStepStartedAt: '2026-07-07T12:00:00.000Z',
      }),
    }))

    const { pollEstimateOutcome } = await import('@/lib/estimate/poll-outcome')
    const onStageProgress = vi.fn()

    const outcome = await pollEstimateOutcome({
      projectId: 'proj-1',
      previousEstimateId: null,
      signal: new AbortController().signal,
      attemptId: 'attempt-1',
      intervalMs: 5,
      timeoutMs: 30,
      onStageProgress,
    })

    expect(outcome).toEqual({ state: 'timeout' })
    expect(onStageProgress).toHaveBeenCalledWith({
      lastStep: 'transcribe',
      completedSteps: ['save_recording'],
      activeStepStartedAt: '2026-07-07T12:00:00.000Z',
    })
    const forwarded = onStageProgress.mock.calls[0][0]
    expect(forwarded.analyzedCount).toBeUndefined()
    expect(forwarded.totalCount).toBeUndefined()
    expect(forwarded.failedCount).toBeUndefined()
  })
})
