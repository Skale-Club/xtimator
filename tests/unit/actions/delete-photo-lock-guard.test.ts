import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Security-hardening S3 (audit finding B / fix-pack F2, finding #9) —
 * deletePhoto (lib/actions/photo.ts) previously had NO lock guard at all:
 * addPhotoToEstimate/removePhotoFromEstimate (lib/actions/estimate-photo.ts)
 * already block mutating a locked/signed estimate's photo set, but
 * deletePhoto deletes the photos row directly, which cascades through
 * estimate_photos — silently changing what a signed estimate's share
 * page/PDF renders after delivery. This drives the new pre-delete guard: for
 * EVERY estimate the photo is currently attached to, block when
 * isEstimateLocked(sent_at/client_response) OR an estimate_signatures row
 * exists (mirrors assertPhotoMutationAllowed's two-part predicate exactly,
 * including its error message).
 *
 * Mocking style mirrors tests/unit/actions/estimate-photo-lock-guard.test.ts
 * and tests/unit/actions/create-photo-guards.test.ts: mock
 * '@/lib/supabase/server' createClient to return an object whose
 * `.from(table)` is dispatched through a single configurable fromImpl.
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

const storageDeleteSpy = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/storage', () => ({
  createStorage: vi.fn().mockReturnValue({
    delete: (...args: unknown[]) => storageDeleteSpy(...args),
  }),
}))

const fromImpl = vi.fn()

// Configurable per-test scenario state.
let photoRow: { storage_path: string; project_id: string } | null = {
  storage_path: 'co_1/proj_1/photo_1.webp',
  project_id: 'proj_1',
}
let attachedRows: Array<{ estimate_id: string }> = []
let estimateRow: Record<string, unknown> | null = null
let signatureRows: Array<{ id: string }> = []
let photoRowDeleteCalled = false

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u_1' } } }) },
    from: (t: string) => fromImpl(t),
  }),
}))

function configureSupabase() {
  photoRowDeleteCalled = false
  storageDeleteSpy.mockClear()

  fromImpl.mockImplementation((table: string) => {
    if (table === 'photos') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: photoRow, error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(() => {
            photoRowDeleteCalled = true
            return Promise.resolve({ error: null })
          }),
        }),
      }
    }
    if (table === 'estimate_photos') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: attachedRows, error: null }),
        }),
      }
    }
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
    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  photoRow = { storage_path: 'co_1/proj_1/photo_1.webp', project_id: 'proj_1' }
  attachedRows = []
  estimateRow = { sent_at: null, client_response: null }
  signatureRows = []
  configureSupabase()
})

describe('deletePhoto — lock guard (fix-pack F2, finding #9)', () => {
  it('rejects when the photo is attached to a sent (locked) estimate', async () => {
    attachedRows = [{ estimate_id: 'est_1' }]
    estimateRow = { sent_at: '2026-07-01T00:00:00.000Z', client_response: null }
    const { deletePhoto } = await import('@/lib/actions/photo')

    const result = await deletePhoto('photo_1')

    expect(result.error).toMatch(/locked/i)
    expect(photoRowDeleteCalled).toBe(false)
    expect(storageDeleteSpy).not.toHaveBeenCalled()
  })

  it('rejects when the photo is attached to a responded estimate (client_response set)', async () => {
    attachedRows = [{ estimate_id: 'est_1' }]
    estimateRow = { sent_at: null, client_response: 'accepted' }
    const { deletePhoto } = await import('@/lib/actions/photo')

    const result = await deletePhoto('photo_1')

    expect(result.error).toMatch(/locked/i)
    expect(photoRowDeleteCalled).toBe(false)
  })

  it('rejects when a signature row exists even though sent_at/client_response are both still null', async () => {
    attachedRows = [{ estimate_id: 'est_1' }]
    estimateRow = { sent_at: null, client_response: null }
    signatureRows = [{ id: 'sig_1' }]
    const { deletePhoto } = await import('@/lib/actions/photo')

    const result = await deletePhoto('photo_1')

    expect(result.error).toMatch(/locked/i)
    expect(photoRowDeleteCalled).toBe(false)
  })

  it('uses the SAME error message the estimate-photo guard uses', async () => {
    attachedRows = [{ estimate_id: 'est_1' }]
    estimateRow = { sent_at: '2026-07-01T00:00:00.000Z', client_response: null }
    const { deletePhoto } = await import('@/lib/actions/photo')

    const result = await deletePhoto('photo_1')

    expect(result.error).toBe(
      'Estimate has been delivered and is locked; create a new version to make changes'
    )
  })

  it('allows deleting a photo attached only to a draft (unlocked, unsigned) estimate', async () => {
    attachedRows = [{ estimate_id: 'est_1' }]
    estimateRow = { sent_at: null, client_response: null }
    signatureRows = []
    const { deletePhoto } = await import('@/lib/actions/photo')

    const result = await deletePhoto('photo_1')

    expect(result.error).toBeUndefined()
    expect(result.data).toBe(true)
    expect(photoRowDeleteCalled).toBe(true)
    expect(storageDeleteSpy).toHaveBeenCalledOnce()
  })

  it('allows deleting an unattached photo (no estimate_photos rows)', async () => {
    attachedRows = []
    const { deletePhoto } = await import('@/lib/actions/photo')

    const result = await deletePhoto('photo_1')

    expect(result.error).toBeUndefined()
    expect(result.data).toBe(true)
    expect(photoRowDeleteCalled).toBe(true)
  })
})
