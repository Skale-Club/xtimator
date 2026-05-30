import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * EVENT-01/02/03: recordPipelineEvent helper contract.
 *
 * RED until Wave 1 implements lib/observability/pipeline-events.ts (currently a
 * throwing Wave-0 scaffold). These tests assert the Wave-1 behavior:
 *   (a) maps the camelCase PipelineEventInput → snake_case D-02 row and calls
 *       .from('pipeline_events').insert(...) via requireServiceClient()
 *   (b) BEST-EFFORT (D-06): when .insert() rejects, the call RESOLVES (never throws)
 *       and console.warn is called
 *   (c) retry_count (D-09): when prior events exist for attempt_id+step, the inserted
 *       row carries the incremented retry_count
 *
 * Mocking follows tests/unit/api/transcribe-dispatch.test.ts (vi.mock the service module).
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import { recordPipelineEvent } from '@/lib/observability/pipeline-events'
import { requireServiceClient } from '@/lib/supabase/service'

const mockRequireServiceClient = vi.mocked(requireServiceClient)

/**
 * Builds a chainable supabase mock:
 *  - `.from('pipeline_events').insert(row)` resolves (capturing the row) unless
 *    insertRejects is set, in which case it rejects.
 *  - the retry-count read `.from(...).select(..., { count, head }).eq().eq().eq()`
 *    resolves to { count: priorCount }.
 */
function makeServiceMock(opts: { insertRejects?: boolean; priorCount?: number } = {}) {
  const { insertRejects = false, priorCount = 0 } = opts
  const insert = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    captured.insertRow = row
    return insertRejects
      ? Promise.reject(new Error('insert failed'))
      : Promise.resolve({ data: null, error: null })
  })

  // terminal eq() of the count chain resolves to { count }
  const countResult = Promise.resolve({ count: priorCount, error: null })
  const eq3 = vi.fn().mockReturnValue(countResult)
  const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq: eq1 })

  const from = vi.fn().mockReturnValue({ insert, select })
  return { from } as unknown as ReturnType<typeof requireServiceClient>
}

const captured: { insertRow?: Record<string, unknown> } = {}

const baseInput = {
  attemptId: 'attempt-1',
  inputType: 'recording' as const,
  step: 'transcribe' as const,
  status: 'succeeded' as const,
  companyId: 'company-1',
  projectId: 'project-1',
  estimateId: null,
  userId: 'user-1',
  provider: 'openrouter' as const,
  durationMs: 1234,
}

describe('EVENT-01/02/03: recordPipelineEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    captured.insertRow = undefined
  })

  it('inserts the snake_case D-02 shape into pipeline_events via the service client', async () => {
    const svc = makeServiceMock()
    mockRequireServiceClient.mockReturnValue(svc)

    await recordPipelineEvent(baseInput)

    const fromMock = vi.mocked((svc as unknown as { from: ReturnType<typeof vi.fn> }).from)
    expect(fromMock).toHaveBeenCalledWith('pipeline_events')
    expect(captured.insertRow).toMatchObject({
      attempt_id: 'attempt-1',
      input_type: 'recording',
      step: 'transcribe',
      status: 'succeeded',
      company_id: 'company-1',
      project_id: 'project-1',
      user_id: 'user-1',
      provider: 'openrouter',
      duration_ms: 1234,
    })
  })

  it('is best-effort (D-06): resolves and warns when the insert rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const svc = makeServiceMock({ insertRejects: true })
    mockRequireServiceClient.mockReturnValue(svc)

    await expect(recordPipelineEvent(baseInput)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('increments retry_count from the prior count for this attempt_id+step (D-09)', async () => {
    const svc = makeServiceMock({ priorCount: 2 })
    mockRequireServiceClient.mockReturnValue(svc)

    await recordPipelineEvent(baseInput)

    expect(captured.insertRow?.retry_count).toBe(2)
  })
})
