import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * EVENT-04 (D-10): the existing estimate_activity `recording_added` write inside
 * createRecording() must keep firing unchanged after Phase 92 instrumentation is added.
 *
 * This is a REGRESSION GUARD — it must stay GREEN through every wave. It uses the
 * makeSupabaseMock table-switch pattern from tests/unit/api/transcribe-dispatch.test.ts:52-103
 * and spies on the estimate_activity insert.
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

import { createRecording } from '@/lib/actions/recording'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'

const mockCreateClient = vi.mocked(createClient)
const mockGetActiveCompanyId = vi.mocked(getActiveCompanyId)

// Captures every insert grouped by table so we can assert the recording_added row.
const inserts: Record<string, unknown[]> = {}

function makeSupabaseMock() {
  inserts.recordings = []
  inserts.estimate_activity = []

  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-1' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'company-1' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'recordings') {
        return {
          // createRecording: .from('recordings').insert(...).select().single()
          insert: vi.fn().mockImplementation((row: unknown) => {
            inserts.recordings.push(row)
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'rec-1', project_id: 'project-1' },
                  error: null,
                }),
              }),
            }
          }),
          // first-recording count: .from('recordings').select('*', { count, head }).eq(...)
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
          }),
        }
      }
      if (table === 'projects') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'estimate_activity') {
        return {
          insert: vi.fn().mockImplementation((row: unknown) => {
            inserts.estimate_activity.push(row)
            return Promise.resolve({ error: null })
          }),
        }
      }
      return {}
    }),
  }
}

describe('EVENT-04: recording_added activity write preserved', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createRecording still inserts estimate_activity recording_added (D-10)', async () => {
    mockGetActiveCompanyId.mockResolvedValue('company-1')
    mockCreateClient.mockResolvedValue(makeSupabaseMock() as never)

    await createRecording('project-1', 'company-1/project-1/rec.webm', 42)

    const activityRows = inserts.estimate_activity as Array<{ event_type?: string }>
    const recordingAdded = activityRows.find((r) => r.event_type === 'recording_added')
    expect(recordingAdded, 'recording_added activity row was not inserted').toBeDefined()
    expect(recordingAdded).toMatchObject({
      project_id: 'project-1',
      company_id: 'company-1',
      event_type: 'recording_added',
    })
  })
})
