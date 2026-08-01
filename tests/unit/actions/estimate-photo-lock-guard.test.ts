import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Security-hardening S3 (audit finding B) — photo lock guard.
 *
 * addPhotoToEstimate/removePhotoFromEstimate (lib/actions/estimate-photo.ts)
 * previously had NO lock guard at all, and photo URLs are deliberately NOT
 * frozen into the signed snapshot (lib/estimate/signed-snapshot.ts) — so an
 * owner could change the attached photo set on a signed estimate and the
 * client-facing signed share page/PDF would change after delivery. This
 * mirrors the two-part check in app/api/estimates/[id]/refine/route.ts:
 * isEstimateLocked({sent_at, client_response}) OR an existing
 * estimate_signatures row (the sign route inserts the signature BEFORE
 * respondToEstimate and swallows a respond failure, so a signature can exist
 * while client_response is still null).
 *
 * Mocking style mirrors tests/unit/actions/estimate-lock-guard.test.ts and
 * tests/unit/actions/create-photo-guards.test.ts: mock '@/lib/supabase/server'
 * createClient to return an object whose `.from(table)` is dispatched through
 * a single configurable fromImpl.
 */

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn().mockResolvedValue('co_1'),
}))

vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn().mockResolvedValue(null),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/queries/estimate-photo', () => ({
  getAttachedPhotoIds: vi.fn().mockResolvedValue(new Set()),
}))

const fromImpl = vi.fn()

// Configurable per-test estimate row + signature rows.
let estimateRow: Record<string, unknown> | null = null
let signatureRows: Array<{ id: string }> = []
let photoInsertCalled = false
let photoDeleteCalled = false

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u_1' } } }) },
    from: (t: string) => fromImpl(t),
  }),
}))

function configureSupabase() {
  photoInsertCalled = false
  photoDeleteCalled = false

  fromImpl.mockImplementation((table: string) => {
    if (table === 'estimates') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: estimateRow, error: null }),
          }),
        }),
      }
    }
    if (table === 'estimate_signatures') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: signatureRows, error: null }),
          }),
        }),
      }
    }
    if (table === 'estimate_photos') {
      return {
        select: vi.fn().mockImplementation((_cols: string, opts?: { count?: string }) => {
          if (opts?.count) {
            return {
              eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }
        }),
        insert: vi.fn().mockImplementation(() => {
          photoInsertCalled = true
          return Promise.resolve({ error: null })
        }),
        delete: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation(() => {
              photoDeleteCalled = true
              return Promise.resolve({ error: null })
            }),
          }),
        })),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  estimateRow = { project_id: 'proj_1', sent_at: null, client_response: null }
  signatureRows = []
  configureSupabase()
})

describe('addPhotoToEstimate — lock guard', () => {
  it('rejects on a sent (locked) estimate', async () => {
    estimateRow = { project_id: 'proj_1', sent_at: '2026-07-01T00:00:00.000Z', client_response: null }
    const { addPhotoToEstimate } = await import('@/lib/actions/estimate-photo')

    const result = await addPhotoToEstimate('est_1', 'photo_1')

    expect(result.error).toMatch(/locked/i)
    expect(photoInsertCalled).toBe(false)
  })

  it('rejects on a responded estimate (client_response set)', async () => {
    estimateRow = { project_id: 'proj_1', sent_at: null, client_response: 'accepted' }
    const { addPhotoToEstimate } = await import('@/lib/actions/estimate-photo')

    const result = await addPhotoToEstimate('est_1', 'photo_1')

    expect(result.error).toMatch(/locked/i)
    expect(photoInsertCalled).toBe(false)
  })

  it('rejects when a signature row exists even though sent_at/client_response are both still null', async () => {
    estimateRow = { project_id: 'proj_1', sent_at: null, client_response: null }
    signatureRows = [{ id: 'sig_1' }]
    const { addPhotoToEstimate } = await import('@/lib/actions/estimate-photo')

    const result = await addPhotoToEstimate('est_1', 'photo_1')

    expect(result.error).toMatch(/locked/i)
    expect(photoInsertCalled).toBe(false)
  })

  it('allows attaching a photo to a draft estimate (unlocked, unsigned)', async () => {
    const { addPhotoToEstimate } = await import('@/lib/actions/estimate-photo')

    const result = await addPhotoToEstimate('est_1', 'photo_1')

    expect(result.error).toBeUndefined()
    expect(result.data).toBe(true)
    expect(photoInsertCalled).toBe(true)
  })
})

describe('removePhotoFromEstimate — lock guard', () => {
  it('rejects on a locked estimate', async () => {
    estimateRow = { project_id: 'proj_1', sent_at: '2026-07-01T00:00:00.000Z', client_response: null }
    const { removePhotoFromEstimate } = await import('@/lib/actions/estimate-photo')

    const result = await removePhotoFromEstimate('est_1', 'photo_1')

    expect(result.error).toMatch(/locked/i)
    expect(photoDeleteCalled).toBe(false)
  })

  it('rejects when signed but client_response still null (signed-but-unresponded window)', async () => {
    signatureRows = [{ id: 'sig_1' }]
    const { removePhotoFromEstimate } = await import('@/lib/actions/estimate-photo')

    const result = await removePhotoFromEstimate('est_1', 'photo_1')

    expect(result.error).toMatch(/locked/i)
    expect(photoDeleteCalled).toBe(false)
  })

  it('allows removing a photo from a draft estimate', async () => {
    const { removePhotoFromEstimate } = await import('@/lib/actions/estimate-photo')

    const result = await removePhotoFromEstimate('est_1', 'photo_1')

    expect(result.error).toBeUndefined()
    expect(result.data).toBe(true)
    expect(photoDeleteCalled).toBe(true)
  })
})
