import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 260707-grq (P0 hotfix): every early-return in createRecording/createTextRecording
 * previously ran BEFORE any recordPipelineEvent call — a failure was invisible in
 * /admin/events. This is exactly how today's production killer went undetected:
 * a stale-closure client duration=0 hit the B10 validation branch in createRecording
 * and silently died with zero DB trace.
 *
 * These tests assert every early-return now writes a failed pipeline_events row
 * with a distinguishing errorCode, in addition to the existing { error } return.
 *
 * Mocking follows tests/unit/actions/create-recording-guards.test.ts (table-switch
 * supabase mock) + tests/unit/observability/record-pipeline-event.test.ts (service
 * client shape) — recordPipelineEvent itself is mocked directly here so we can
 * assert on its call args without also mocking requireServiceClient.
 */

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/observability/pipeline-events', () => ({
  recordPipelineEvent: vi.fn().mockResolvedValue(undefined),
}))

// 260707-hhp (P1): createTextRecording's optional chain dispatches via the
// Inngest client — mocked so the "dispatch failure" path is testable without
// a real Inngest event key.
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn() },
}))

import { createRecording, createTextRecording } from '@/lib/actions/recording'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { recordPipelineEvent } from '@/lib/observability/pipeline-events'
import { inngest } from '@/lib/inngest/client'

const mockCreateClient = vi.mocked(createClient)
const mockGetActiveCompanyId = vi.mocked(getActiveCompanyId)
const mockRecordPipelineEvent = vi.mocked(recordPipelineEvent)
const mockInngestSend = vi.mocked(inngest.send)

const insertSpy = vi.fn().mockImplementation((row: unknown) => ({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({
      data: { id: 'rec-1', project_id: 'project-1', ...(row as object) },
      error: null,
    }),
  }),
}))

function makeSupabaseMock(opts: { authed?: boolean } = {}) {
  const { authed = true } = opts
  insertSpy.mockClear()
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: authed ? { sub: 'user-1' } : null },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
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
    }),
  }
}

describe('createRecording — early-return pipeline events (260707-grq)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveCompanyId.mockResolvedValue('company-1')
  })

  it('validation_duration: rejects a stale-closure 0 duration and records a failed event (TODAY\'S PRODUCTION KILLER)', async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock() as never)

    const result = await createRecording('project-1', 'company-1/project-1/rec.webm', 0)

    expect(result).toEqual({ error: 'Invalid recording duration.' })
    expect(insertSpy).not.toHaveBeenCalled()
    expect(mockRecordPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'save_recording',
        status: 'failed',
        errorCode: 'validation_duration',
        companyId: 'company-1',
        projectId: 'project-1',
      })
    )
  })

  it('validation_path: rejects a storagePath outside the caller company prefix and records a failed event', async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock() as never)

    const result = await createRecording('project-1', 'company-OTHER/project-1/rec.webm', 42)

    expect(result).toEqual({ error: 'Invalid recording path.' })
    expect(insertSpy).not.toHaveBeenCalled()
    expect(mockRecordPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'save_recording',
        status: 'failed',
        errorCode: 'validation_path',
        companyId: 'company-1',
        projectId: 'project-1',
      })
    )
  })

  it('auth: an unauthenticated caller records a failed event with companyId null', async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ authed: false }) as never)

    const result = await createRecording('project-1', 'company-1/project-1/rec.webm', 42)

    expect(result).toEqual({ error: 'Not authenticated' })
    expect(insertSpy).not.toHaveBeenCalled()
    expect(mockRecordPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'save_recording',
        status: 'failed',
        errorCode: 'auth',
        companyId: null,
      })
    )
  })

  it('accepts a valid path + sane duration and does NOT record a failed event', async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock() as never)

    const result = await createRecording('project-1', 'company-1/project-1/rec.webm', 42)

    expect('error' in result).toBe(false)
    expect(insertSpy).toHaveBeenCalledOnce()
    const failedCalls = mockRecordPipelineEvent.mock.calls.filter(
      ([ev]) => ev.status === 'failed'
    )
    expect(failedCalls).toHaveLength(0)
  })
})

// 260707-hhp (P1): createTextRecording's optional server-side chain into
// generate-estimate. Reuses this file's table-switch supabase mock convention.
function makeTextRecordingSupabaseMock() {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-1' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'recordings') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'rec-text-1', project_id: 'project-1', transcript: 'a description' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'estimate_activity') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return {}
    }),
  }
}

describe('createTextRecording — optional generate-estimate chain (260707-hhp)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveCompanyId.mockResolvedValue('company-1')
  })

  it('dispatch failure returns the friendly error AND records errorCode dispatch_failed', async () => {
    mockCreateClient.mockResolvedValue(makeTextRecordingSupabaseMock() as never)
    mockInngestSend.mockRejectedValue(new Error('inngest unavailable'))

    const result = await createTextRecording('project-1', 'a description', 'attempt-1', {
      autoGenerateEstimate: true,
      requestId: 'req-1',
    })

    expect(result).toEqual({
      error: 'Your description was saved but generation could not start — please retry.',
    })
    expect(mockRecordPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'attempt-1',
        step: 'generate_estimate',
        status: 'failed',
        errorCode: 'dispatch_failed',
        companyId: 'company-1',
        projectId: 'project-1',
      })
    )
  })

  it('dispatch success returns data + jobId without recording a failed event', async () => {
    mockCreateClient.mockResolvedValue(makeTextRecordingSupabaseMock() as never)
    mockInngestSend.mockResolvedValue({ ids: ['job-1'] } as never)

    const result = await createTextRecording('project-1', 'a description', 'attempt-1', {
      autoGenerateEstimate: true,
      requestId: 'req-1',
    })

    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.jobId).toBe('job-1')
      expect(result.data).toEqual(
        expect.objectContaining({ id: 'rec-text-1' })
      )
    }
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'estimate-project-1-req-1',
        data: expect.objectContaining({
          companyId: 'company-1',
          projectId: 'project-1',
          inputType: 'manual_text',
          channel: 'web',
        }),
      })
    )
    const failedCalls = mockRecordPipelineEvent.mock.calls.filter(
      ([ev]) => ev.status === 'failed'
    )
    expect(failedCalls).toHaveLength(0)
  })
})
