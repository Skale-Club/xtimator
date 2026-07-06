import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Pre-launch audit fix (A-3): createPhoto() (lib/actions/photo.ts) previously
 * trusted the client-supplied storagePath verbatim and had no server-side cap
 * on photos per project (only a client-side MAX_PHOTOS=16 in
 * capture-recorder.tsx). Two guards were added:
 *   1. storagePath must be prefixed with `${company.id}/`.
 *   2. A project may not exceed MAX_PHOTOS_PER_PROJECT (50) photo rows —
 *      complements the analyze-photos job's own MAX_PHOTOS_PER_JOB cap.
 */

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(),
}))

vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn().mockResolvedValue(null),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { createPhoto } from '@/lib/actions/photo'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'

const mockCreateClient = vi.mocked(createClient)
const mockGetActiveCompanyId = vi.mocked(getActiveCompanyId)

const insertSpy = vi.fn().mockImplementation((row: unknown) => ({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: { id: 'photo-1', ...(row as object) }, error: null }),
  }),
}))

let existingPhotoCount = 0

function makeSupabaseMock() {
  insertSpy.mockClear()
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-1' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'photos') {
        return {
          insert: insertSpy,
          select: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockResolvedValue({ count: existingPhotoCount, error: null }),
          })),
        }
      }
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { status: 'draft' }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'estimate_activity') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return {}
    }),
  }
}

describe('createPhoto — storagePath / per-project cap guards (A-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existingPhotoCount = 0
    mockGetActiveCompanyId.mockResolvedValue('company-1')
    mockCreateClient.mockResolvedValue(makeSupabaseMock() as never)
  })

  it('accepts a storagePath prefixed with the caller company id, under the cap', async () => {
    const result = await createPhoto('project-1', 'company-1/photos/pic.jpg', 0)
    expect(result.error).toBeUndefined()
    expect(insertSpy).toHaveBeenCalledOnce()
  })

  it('rejects a storagePath prefixed with a DIFFERENT company id (cross-tenant path)', async () => {
    const result = await createPhoto('project-1', 'company-OTHER/photos/pic.jpg', 0)
    expect(result.error).toBeDefined()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('rejects when the project already has MAX_PHOTOS_PER_PROJECT photos', async () => {
    existingPhotoCount = 50
    const result = await createPhoto('project-1', 'company-1/photos/pic.jpg', 50)
    expect(result.error).toMatch(/maximum/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('accepts right at the boundary below the cap', async () => {
    existingPhotoCount = 49
    const result = await createPhoto('project-1', 'company-1/photos/pic.jpg', 49)
    expect(result.error).toBeUndefined()
    expect(insertSpy).toHaveBeenCalledOnce()
  })
})
