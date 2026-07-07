import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Pre-launch audit fix (A-2 / B10): createRecording() (lib/actions/recording.ts)
 * previously trusted the client-supplied storagePath and durationSeconds
 * verbatim. Two guards were added:
 *   1. storagePath must be prefixed with `${company.id}/` — otherwise the
 *      transcribe worker (service role, no per-file ownership check on the
 *      download itself) could be pointed at another tenant's audio file.
 *   2. durationSeconds must be a positive number within a sane ceiling — a
 *      declared 0 previously made the Whisper cost computation return null,
 *      silently skipping the credit debit ("free" transcription).
 *
 * Reuses the makeSupabaseMock table-switch pattern from
 * tests/unit/observability/event04-regression.test.ts.
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

const insertSpy = vi.fn().mockImplementation((row: unknown) => {
  return {
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'rec-1', project_id: 'project-1', ...(row as object) },
        error: null,
      }),
    }),
  }
})

function makeSupabaseMock() {
  insertSpy.mockClear()
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

describe('createRecording — storagePath / duration guards (A-2 / B10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveCompanyId.mockResolvedValue('company-1')
    mockCreateClient.mockResolvedValue(makeSupabaseMock() as never)
  })

  it('accepts a storagePath prefixed with the caller company id and a sane duration', async () => {
    const result = await createRecording('project-1', 'company-1/project-1/rec.webm', 42)
    expect(result.error).toBeUndefined()
    expect(insertSpy).toHaveBeenCalledOnce()
  })

  it('rejects a storagePath prefixed with a DIFFERENT company id (cross-tenant path)', async () => {
    const result = await createRecording('project-1', 'company-OTHER/project-1/rec.webm', 42)
    expect(result.error).toBeDefined()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('rejects a storagePath with no company prefix at all', async () => {
    const result = await createRecording('project-1', 'rec.webm', 42)
    expect(result.error).toBeDefined()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('rejects duration_seconds = 0 (would silently skip the credit debit)', async () => {
    const result = await createRecording('project-1', 'company-1/project-1/rec.webm', 0)
    expect(result.error).toBeDefined()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('rejects a negative duration', async () => {
    const result = await createRecording('project-1', 'company-1/project-1/rec.webm', -5)
    expect(result.error).toBeDefined()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('rejects a duration far beyond the client hard-cap (abusive claim)', async () => {
    const result = await createRecording('project-1', 'company-1/project-1/rec.webm', 999_999)
    expect(result.error).toBeDefined()
    expect(insertSpy).not.toHaveBeenCalled()
  })
})
